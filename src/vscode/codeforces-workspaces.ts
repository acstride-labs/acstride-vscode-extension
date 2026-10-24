import type { Language } from '../domain/models';
import { ContestService, type ProblemReader } from '../application/contest-service';
import type { CodeforcesApi } from '../infrastructure/codeforces/api-client';
import { ContestRepository } from '../infrastructure/storage/contest-repository';
export type CodeforcesCollection = 'contest' | 'standalone';
/** Both collections share download, retry and storage behavior, but never share user files. */
export class CodeforcesWorkspaces {
  private entries = new Map<
    CodeforcesCollection,
    { repo: ContestRepository; service: ContestService }
  >();
  constructor(
    private root: () => string,
    private api: CodeforcesApi,
    private reader: ProblemReader,
    private template: (language: Language, index: string) => Promise<string>,
    private changed: (id: number, collection: CodeforcesCollection) => void,
    private downloaded: (
      id: number,
      index: string,
      statement: import('../domain/contest').Statement,
      collection: CodeforcesCollection,
    ) => void = () => {},
  ) {}
  get(collection: CodeforcesCollection = 'contest') {
    const root = this.root();
    let entry = this.entries.get(collection);
    if (entry?.repo.root !== root) {
      entry?.service.dispose();
      const repo = new ContestRepository(root, collection);
      entry = {
        repo,
        service: new ContestService(
          repo,
          this.api,
          this.reader,
          this.template,
          (id) => this.changed(id, collection),
          (id, index, statement) => this.downloaded(id, index, statement, collection),
        ),
      };
      this.entries.set(collection, entry);
    }
    return entry;
  }
  dispose() {
    for (const entry of this.entries.values()) entry.service.dispose();
    this.entries.clear();
  }
}
