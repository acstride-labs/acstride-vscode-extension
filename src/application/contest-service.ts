import type { Language } from '../domain/models';
import type { Statement } from '../domain/contest';
import { ContestRepository } from '../infrastructure/storage/contest-repository';
import type { CodeforcesApi } from '../infrastructure/codeforces/api-client';
import type { PublicProblemReader } from '../infrastructure/codeforces/public-problem-client';
import { parseStatement } from '../infrastructure/codeforces/statement-parser';

type Api = Pick<CodeforcesApi, 'contest' | 'standings' | 'submissions'>;
export class ContestService {
  private syncing = new Set<number>();
  private polling = new Set<number>();
  private stopped = false;
  private tickBusy = false;
  private lastMetadata = 0;
  constructor(
    readonly repository: ContestRepository,
    private api: Api,
    private reader: PublicProblemReader,
    private template: (language: Language, index: string) => Promise<string>,
    private changed: (id: number) => void = () => {},
    private cacheStatement: (id: number, statement: Statement) => Promise<Statement> = async (
      _,
      statement,
    ) => statement,
  ) {}
  async add(id: number, language: Language) {
    const record = await this.repository.add(await this.api.contest(id), language);
    this.changed(id);
    return record;
  }
  async ensureSolution(id: number, index: string) {
    const record = await this.repository.get(id);
    const item = record.problems.find((p) => p.index === index);
    if (!item || record.contest.phase === 'BEFORE')
      throw new Error('This problem has not been released by Codeforces.');
    const store = this.repository.problems(id);
    const existing = (await store.listProblems()).find((p) => p.id === index);
    if (existing) return existing;
    try {
      return await store.createProblem(
        index,
        item.name,
        await this.template(record.defaultLanguage, index),
        record.defaultLanguage,
      );
    } catch (error) {
      const concurrent = (await store.listProblems()).find((p) => p.id === index);
      if (concurrent) return concurrent;
      throw error;
    }
  }
  async sync(id: number, onlyIndex?: string) {
    if (this.syncing.has(id) || this.stopped) return;
    this.syncing.add(id);
    try {
      const record = await this.repository.get(id);
      const now = Date.now();
      if (
        record.contest.phase === 'BEFORE' &&
        (!record.contest.startTimeSeconds || now < record.contest.startTimeSeconds * 1000)
      )
        return;
      const board = await this.api.standings(id);
      await this.repository.saveStandings(id, board);
      await this.repository.update(id, (r) => {
        r.contest = board.contest;
        r.updatedAt = now;
        for (const p of board.problems)
          if (!r.problems.some((old) => old.index === p.index))
            r.problems.push({ ...p, ready: false });
      });
      this.changed(id);
      for (const problem of (await this.repository.get(id)).problems) {
        if (this.stopped) return;
        if (onlyIndex ? problem.index !== onlyIndex : problem.ready) continue;
        try {
          // Source creation must not depend on website access. Download failure must not block coding.
          await this.ensureSolution(id, problem.index);
          const url = `/contest/${id}/problem/${encodeURIComponent(problem.index)}`;
          const page = await this.reader.page(url);
          const parsed = parseStatement(page.html, `https://codeforces.com${url}`);
          const store = this.repository.problems(id);
          await store.importSamples(problem.index, parsed.samples);
          await this.repository.saveStatement(
            id,
            problem.index,
            await this.cacheStatement(id, parsed.statement),
          );
          await this.repository.update(id, (r) => {
            const p = r.problems.find((p) => p.index === problem.index)!;
            p.ready = true;
            delete p.error;
          });
        } catch (error) {
          await this.repository.update(id, (r) => {
            const p = r.problems.find((p) => p.index === problem.index)!;
            p.error = message(error);
          });
        }
        this.changed(id);
      }
      await this.repository.update(id, (r) => {
        const failed = r.problems.some((p) => !p.ready);
        r.retryCount = failed ? r.retryCount + 1 : 0;
        r.nextRetryAt = failed
          ? Date.now() + Math.min(180000, 15000 * 2 ** Math.min(r.retryCount, 4))
          : 0;
        r.error = failed ? 'Some problems are not ready; automatic retry is scheduled.' : undefined;
      });
    } catch (error) {
      await this.repository.update(id, (r) => {
        r.retryCount++;
        r.nextRetryAt = Date.now() + Math.min(180000, 15000 * 2 ** Math.min(r.retryCount, 4));
        r.error = message(error);
      });
    } finally {
      this.syncing.delete(id);
      this.changed(id);
    }
  }
  async refreshMetadata(id: number) {
    const contest = await this.api.contest(id);
    await this.repository.update(id, (r) => {
      r.contest = contest;
      r.updatedAt = Date.now();
    });
    this.changed(id);
  }
  async importProblemHtml(id: number, index: string, html: string) {
    if (this.syncing.has(id))
      throw new Error('Wait for this contest download to finish before importing HTML.');
    if (html.length > 8000000) throw new Error('Problem HTML exceeds the supported size.');
    const parsed = parseStatement(html, `https://codeforces.com/contest/${id}/problem/${index}`);
    if (!parsed.statement.title.toLowerCase().startsWith(index.toLowerCase() + '.'))
      throw new Error('The HTML problem index does not match the selected problem.');
    await this.ensureSolution(id, index);
    await this.repository.problems(id).importSamples(index, parsed.samples);
    await this.repository.saveStatement(id, index, await this.cacheStatement(id, parsed.statement));
    await this.repository.update(id, (r) => {
      const item = r.problems.find((p) => p.index === index)!;
      item.ready = true;
      delete item.error;
      if (r.problems.every((p) => p.ready)) {
        delete r.error;
        r.nextRetryAt = 0;
        r.retryCount = 0;
      }
    });
    this.changed(id);
  }
  async tick(now = Date.now()) {
    if (this.stopped || this.tickBusy) return;
    this.tickBusy = true;
    try {
      const records = await this.repository.list();
      const refresh = now - this.lastMetadata >= 60000;
      if (refresh) this.lastMetadata = now;
      for (const record of records) {
        if (this.stopped) return;
        if (record.archived) continue;
        if (refresh && record.contest.phase !== 'FINISHED') {
          try {
            await this.refreshMetadata(record.contest.id);
          } catch {
            /* Keep cached contest information on network failure. */
          }
        }
        const due =
          record.contest.phase !== 'BEFORE' ||
          (!!record.contest.startTimeSeconds && now >= record.contest.startTimeSeconds * 1000);
        if (
          record.autoDownload &&
          due &&
          record.nextRetryAt <= now &&
          (!record.problems.length || record.problems.some((p) => !p.ready))
        )
          await this.sync(record.contest.id);
      }
    } finally {
      this.tickBusy = false;
    }
  }
  async refreshBoard(id: number) {
    const board = await this.api.standings(id);
    await this.repository.saveStandings(id, board);
    this.changed(id);
  }
  async refreshSubmissions(id: number, handle: string) {
    if (this.polling.has(id) || this.stopped) return;
    this.polling.add(id);
    try {
      const submissions = await this.api.submissions(id, handle);
      await this.repository.saveSubmissions(id, handle, submissions);
      this.changed(id);
    } finally {
      this.polling.delete(id);
    }
  }
  dispose() {
    this.stopped = true;
  }
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
