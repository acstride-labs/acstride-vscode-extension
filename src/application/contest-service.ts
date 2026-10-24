import type { Language } from '../domain/models';
import { maxDownloadAttempts, type Statement } from '../domain/contest';
import { ContestRepository } from '../infrastructure/storage/contest-repository';
import type { CodeforcesApi } from '../infrastructure/codeforces/api-client';
import type { TestCase } from '../domain/models';

export interface ProblemReader {
  problem(
    id: number,
    index: string,
    assetsDir: string,
  ): Promise<{ statement: Statement; samples: TestCase[] }>;
}

type Api = Pick<CodeforcesApi, 'contest' | 'standings' | 'submissions'>;
export class ContestService {
  private syncing = new Map<number, Promise<void>>();
  private requested = new Map<string, Promise<void>>();
  private polling = new Set<number>();
  private stopped = false;
  private tickBusy = false;
  private lastMetadata = 0;
  constructor(
    readonly repository: ContestRepository,
    private api: Api,
    private reader: ProblemReader,
    private template: (language: Language, index: string) => Promise<string>,
    private changed: (id: number) => void = () => {},
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
  sync(id: number, onlyIndex?: string): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const existing = this.syncing.get(id);
    if (existing) return existing;
    const running = this.runSync(id, onlyIndex).finally(() => this.syncing.delete(id));
    this.syncing.set(id, running);
    return running;
  }

  // Explicit selection starts a fresh bounded retry cycle if previous attempts failed.
  ensureDownloaded(id: number, index: string): Promise<void> {
    const key = `${id}/${index}`;
    const existing = this.requested.get(key);
    if (existing) return existing;
    const requested = (async () => {
      await this.syncing.get(id);
      if (this.stopped || (await this.repository.statement(id, index))) return;
      await this.repository.update(id, (record) => {
        const problem = record.problems.find((p) => p.index === index);
        if (!problem) throw new Error('This problem has not been released by Codeforces.');
        problem.ready = false;
        if (problem.downloadAttempts >= maxDownloadAttempts) problem.downloadAttempts = 0;
        problem.nextRetryAt = 0;
        delete problem.error;
      });
      this.changed(id);
      await this.sync(id, index);
    })().finally(() => this.requested.delete(key));
    this.requested.set(key, requested);
    return requested;
  }

  private async runSync(id: number, onlyIndex?: string) {
    try {
      const record = await this.repository.get(id);
      const now = Date.now();
      if (
        record.contest.phase === 'BEFORE' &&
        (!record.contest.startTimeSeconds || now < record.contest.startTimeSeconds * 1000)
      )
        return;
      // A known problem can download independently of an unavailable leaderboard.
      if (!onlyIndex || !record.problems.some((p) => p.index === onlyIndex)) {
        const board = await this.api.standings(id);
        await this.repository.saveStandings(id, board);
        await this.repository.update(id, (r) => {
          r.contest = board.contest;
          r.updatedAt = now;
          r.retryCount = 0;
          delete r.error;
          for (const p of board.problems)
            if (!r.problems.some((old) => old.index === p.index))
              r.problems.push({ ...p, ready: false, downloadAttempts: 0, nextRetryAt: 0 });
        });
      }
      this.changed(id);
      for (const problem of (await this.repository.get(id)).problems) {
        if (this.stopped) return;
        if (
          onlyIndex
            ? problem.index !== onlyIndex
            : problem.ready ||
              problem.downloadAttempts >= maxDownloadAttempts ||
              problem.nextRetryAt > now
        )
          continue;
        await this.repository.update(id, (r) => {
          const p = r.problems.find((p) => p.index === problem.index)!;
          p.downloadAttempts++;
          delete p.error;
        });
        this.changed(id);
        try {
          await this.ensureSolution(id, problem.index);
          const parsed = await this.reader.problem(id, problem.index, this.repository.assets(id));
          if (this.stopped) return;
          const store = this.repository.problems(id);
          await store.importSamples(problem.index, parsed.samples);
          await this.repository.saveStatement(id, problem.index, parsed.statement);
          await this.repository.update(id, (r) => {
            const p = r.problems.find((p) => p.index === problem.index)!;
            p.ready = true;
            p.downloadAttempts = 0;
            p.nextRetryAt = 0;
            delete p.error;
          });
        } catch (error) {
          await this.repository.update(id, (r) => {
            const p = r.problems.find((p) => p.index === problem.index)!;
            p.error = message(error);
            p.nextRetryAt =
              p.downloadAttempts < maxDownloadAttempts
                ? Date.now() + 2000 * 2 ** (p.downloadAttempts - 1)
                : 0;
          });
        }
        this.changed(id);
      }
      await this.repository.update(id, (r) => {
        const retrying = r.problems.filter(
          (p) => !p.ready && p.downloadAttempts < maxDownloadAttempts,
        );
        r.nextRetryAt = retrying.length ? Math.min(...retrying.map((p) => p.nextRetryAt)) : 0;
      });
    } catch (error) {
      await this.repository.update(id, (r) => {
        r.retryCount++;
        r.nextRetryAt = Date.now() + 2000 * 2 ** Math.min(r.retryCount - 1, 4);
        r.error = message(error);
      });
    } finally {
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
        if (!due || record.nextRetryAt > now || this.syncing.has(record.contest.id)) continue;
        // A reload during the last attempt must not leave a permanent loading state.
        if (
          record.problems.some(
            (p) => !p.ready && p.downloadAttempts >= maxDownloadAttempts && !p.error,
          )
        ) {
          await this.repository.update(record.contest.id, (r) => {
            for (const p of r.problems)
              if (!p.ready && p.downloadAttempts >= maxDownloadAttempts && !p.error)
                p.downloadAttempts = maxDownloadAttempts - 1;
          });
          for (const p of record.problems)
            if (!p.ready && p.downloadAttempts >= maxDownloadAttempts && !p.error)
              p.downloadAttempts = maxDownloadAttempts - 1;
        }
        const discover =
          (!record.problems.length && record.retryCount < maxDownloadAttempts) ||
          (refresh && record.contest.phase === 'CODING');
        if (discover) await this.sync(record.contest.id);
        else
          for (const problem of record.problems) {
            if (
              !problem.ready &&
              problem.downloadAttempts < maxDownloadAttempts &&
              problem.nextRetryAt <= now
            )
              await this.sync(record.contest.id, problem.index);
          }
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
