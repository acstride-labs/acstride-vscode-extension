import type { Language } from '../domain/models';
import { maxDownloadAttempts, type Statement } from '../domain/contest';
import { ContestRepository } from '../infrastructure/storage/contest-repository';
import type { CodeforcesApi } from '../infrastructure/codeforces/api-client';
import type { TestCase } from '../domain/models';

export type DownloadedProblem = { statement: Statement; samples: TestCase[] };
export interface DownloadHandlers {
  problem(index: string, value: DownloadedProblem): Promise<void>;
  assets(index: string, value: DownloadedProblem): Promise<void>;
  error(index: string, error: Error): Promise<void>;
}
export interface ProblemReader {
  problems?(
    id: number,
    indices: string[],
    assetsDir: string,
    handlers: DownloadHandlers,
  ): Promise<void>;
  problem(
    id: number,
    index: string,
    assetsDir: string,
  ): Promise<{ statement: Statement; samples: TestCase[] }>;
}

type Api = Pick<CodeforcesApi, 'contest' | 'standings' | 'submissions'> &
  Partial<Pick<CodeforcesApi, 'problems'>>;
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
    private downloaded: (id: number, index: string, statement: Statement) => void = () => {},
  ) {}
  async add(id: number, language: Language) {
    const record = await this.repository.add(await this.api.contest(id), language);
    this.changed(id);
    return record;
  }
  async addProblem(id: number, index: string, language: Language) {
    if (this.repository.collection !== 'standalone')
      throw new Error('Single problems require a standalone repository.');
    const existingRecord = (await this.repository.list()).find((r) => r.contest.id === id);
    const record =
      existingRecord ?? (await this.repository.add(await this.api.contest(id), language));
    if (record.contest.phase === 'BEFORE')
      throw new Error('This problem has not been released by Codeforces.');
    await this.repository.update(id, (r) => {
      if (!r.problems.some((p) => p.index === index))
        r.problems.push({ index, name: index, ready: false, downloadAttempts: 0, nextRetryAt: 0 });
    });
    const store = this.repository.problems(id);
    const existing = (await store.listProblems()).find((p) => p.id === index);
    if (!existing)
      await store.createProblem(index, index, await this.template(language, index), language);
    this.changed(id);
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
  sync(id: number, onlyIndex?: string, discover = true): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const existing = this.syncing.get(id);
    if (existing) {
      if (!onlyIndex) return existing;
      return existing.then(async () => {
        if (this.stopped) return;
        const problem = (await this.repository.get(id)).problems.find((p) => p.index === onlyIndex);
        if (problem && !problem.ready && problem.downloadAttempts < maxDownloadAttempts)
          await this.sync(id, onlyIndex);
      });
    }
    const running = this.runSync(id, onlyIndex, discover).finally(() => this.syncing.delete(id));
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

  private async runSync(id: number, onlyIndex?: string, discover = true) {
    try {
      const record = await this.repository.get(id);
      const now = Date.now();
      if (
        record.contest.phase === 'BEFORE' &&
        (!record.contest.startTimeSeconds || now < record.contest.startTimeSeconds * 1000)
      )
        return;
      // A known problem can download independently of an unavailable leaderboard.
      if (
        this.repository.collection !== 'standalone' &&
        discover &&
        (!onlyIndex || !record.problems.some((p) => p.index === onlyIndex))
      ) {
        const board = this.api.problems
          ? await this.api.problems(id)
          : await this.api.standings(id);
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
      const pending = (await this.repository.get(id)).problems.filter((problem) =>
        onlyIndex
          ? problem.index === onlyIndex
          : !problem.ready &&
            problem.downloadAttempts < maxDownloadAttempts &&
            problem.nextRetryAt <= now,
      );
      for (const problem of pending) {
        if (this.stopped) return;
        await this.ensureSolution(id, problem.index);
        await this.repository.update(id, (r) => {
          const item = r.problems.find((p) => p.index === problem.index)!;
          item.downloadAttempts++;
          delete item.error;
        });
      }
      const handlers: DownloadHandlers = {
        problem: async (index, parsed) => {
          if (this.stopped) return;
          const store = this.repository.problems(id);
          if (this.repository.collection === 'standalone') {
            const title =
              parsed.statement.title.replace(/^[A-Za-z][0-9]*[.．]\s*/, '').slice(0, 200) || index;
            await store.renameProblem(index, title);
            await this.repository.update(id, (r) => {
              r.problems.find((p) => p.index === index)!.name = title;
            });
          }
          await store.importSamples(index, parsed.samples);
          await this.repository.saveStatement(id, index, parsed.statement);
          this.downloaded(id, index, parsed.statement);
          await this.repository.update(id, (r) => {
            const item = r.problems.find((p) => p.index === index)!;
            item.ready = true;
            item.downloadAttempts = 0;
            item.nextRetryAt = 0;
            delete item.error;
          });
          this.changed(id);
        },
        assets: async (index, parsed) => {
          if (this.stopped) return;
          await this.repository.saveStatement(id, index, parsed.statement);
          this.changed(id);
        },
        error: async (index, error) => {
          if (this.stopped) return;
          await this.repository.update(id, (r) => {
            const item = r.problems.find((p) => p.index === index)!;
            item.error = message(error);
            item.nextRetryAt =
              item.downloadAttempts < maxDownloadAttempts
                ? Date.now() + 2000 * 2 ** (item.downloadAttempts - 1)
                : 0;
          });
          this.changed(id);
        },
      };
      this.changed(id);
      if (pending.length && this.reader.problems) {
        await this.reader.problems(
          id,
          pending.map((p) => p.index),
          this.repository.assets(id),
          handlers,
        );
      } else {
        // Compatibility for readers without streaming; production uses Codeforces Client's FIFO scheduler.
        for (const problem of pending) {
          if (this.stopped) return;
          try {
            await handlers.problem(
              problem.index,
              await this.reader.problem(id, problem.index, this.repository.assets(id)),
            );
          } catch (error) {
            await handlers.error(
              problem.index,
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
      }
      await this.repository.update(id, (r) => {
        const retrying = r.problems.filter(
          (p) => !p.ready && p.downloadAttempts < maxDownloadAttempts,
        );
        r.nextRetryAt = retrying.length ? Math.min(...retrying.map((p) => p.nextRetryAt)) : 0;
        if (r.problems.length && r.problems.every((problem) => problem.ready)) {
          delete r.error;
          r.retryCount = 0;
        }
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
        if (discover && this.repository.collection !== 'standalone')
          await this.sync(record.contest.id);
        else if (
          record.problems.some(
            (problem) =>
              !problem.ready &&
              problem.downloadAttempts < maxDownloadAttempts &&
              problem.nextRetryAt <= now,
          )
        )
          await this.sync(record.contest.id, undefined, false);
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
