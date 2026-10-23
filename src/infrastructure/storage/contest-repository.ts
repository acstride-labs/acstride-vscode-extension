import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  contestIdSchema,
  contestRecordSchema,
  problemIndexSchema,
  type Contest,
  type ContestRecord,
  type Statement,
  type Standings,
  type CFSubmission,
} from '../../domain/contest';
import type { Language } from '../../domain/models';
import { FileWorkspaceStore } from './file-workspace-store';

const registrySchema = z.object({
  schemaVersion: z.literal(1),
  contests: z.array(contestIdSchema),
});
export class ContestRepository {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(readonly root: string) {}
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writes.then(fn);
    this.writes = next.catch(() => {});
    return next;
  }
  contestRoot(id: number) {
    return path.join(this.root, 'contests', String(contestIdSchema.parse(id)));
  }
  problems(id: number) {
    return new FileWorkspaceStore(this.contestRoot(id), id);
  }
  assets(id: number) {
    return this.metadata(id, 'statements/assets');
  }
  private metadata(id: number, file: string) {
    return path.join(this.contestRoot(id), '.cfide', file);
  }
  private async read<T>(file: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
      throw error;
    }
  }
  async atomic(file: string, value: unknown) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(value, null, 2));
    await fs.rename(temp, file);
  }
  async list(): Promise<ContestRecord[]> {
    const registry = registrySchema.parse(
      await this.read(path.join(this.root, '.cfide', 'contests.json'), {
        schemaVersion: 1,
        contests: [],
      }),
    );
    return Promise.all(registry.contests.map((id) => this.get(id)));
  }
  async get(id: number): Promise<ContestRecord> {
    const record = contestRecordSchema.parse(
      await this.read(this.metadata(id, 'contest.json'), null),
    );
    // Old cached failures must not send users to removed account/browser controls.
    const currentError = (error?: string) =>
      error &&
      /dedicated (?:browser|chrome)|browser\/site verification|cookie|sign[ -]?in/i.test(error)
        ? 'Previous download failed. Set up public downloads and retry, or import saved problem HTML. No login/browser connection is needed.'
        : error;
    record.error = currentError(record.error);
    for (const problem of record.problems) problem.error = currentError(problem.error);
    return record;
  }
  async add(contest: Contest, language: Language) {
    return this.exclusive(async () => {
      const file = path.join(this.root, '.cfide', 'contests.json');
      const registry = registrySchema.parse(
        await this.read(file, { schemaVersion: 1, contests: [] }),
      );
      if (registry.contests.includes(contest.id)) return this.get(contest.id);
      const record: ContestRecord = {
        schemaVersion: 1,
        contest,
        defaultLanguage: language,
        autoDownload: true,
        archived: false,
        problems: [],
        updatedAt: Date.now(),
        retryCount: 0,
        nextRetryAt: 0,
      };
      await this.atomic(this.metadata(contest.id, 'contest.json'), record);
      registry.contests.push(contest.id);
      await this.atomic(file, registry);
      return record;
    });
  }
  async update(id: number, change: (record: ContestRecord) => void) {
    return this.exclusive(async () => {
      const record = await this.get(id);
      change(record);
      await this.atomic(this.metadata(id, 'contest.json'), contestRecordSchema.parse(record));
      return record;
    });
  }
  async saveStatement(id: number, index: string, statement: Statement) {
    await this.atomic(
      this.metadata(id, `statements/${problemIndexSchema.parse(index)}.json`),
      statement,
    );
  }
  async statement(id: number, index: string): Promise<Statement | null> {
    return this.read(this.metadata(id, `statements/${problemIndexSchema.parse(index)}.json`), null);
  }
  async saveStandings(id: number, data: Standings) {
    await this.atomic(this.metadata(id, 'standings.json'), data);
  }
  async standings(id: number): Promise<Standings | null> {
    return this.read(this.metadata(id, 'standings.json'), null);
  }
  async saveSubmissions(id: number, handle: string, data: CFSubmission[]) {
    await this.atomic(this.metadata(id, `status-${safeHandle(handle)}.json`), {
      handle,
      fetchedAt: Date.now(),
      submissions: data,
    });
  }
  async submissions(
    id: number,
    handle: string,
  ): Promise<{ fetchedAt: number; submissions: CFSubmission[] }> {
    return this.read(this.metadata(id, `status-${safeHandle(handle)}.json`), {
      fetchedAt: 0,
      submissions: [],
    });
  }
}
function safeHandle(handle: string) {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(handle)) throw new Error('Invalid Codeforces handle.');
  return handle;
}
