import { languageIds } from '../../domain/models';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { importTimestamp } from './import-order';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { WorkspaceStore } from '../../application/ports/workspace-store';
import type { Language, Problem, TestCase } from '../../domain/models';
import { newestImportedFirst } from '../../domain/contest';
import { languages } from '../../domain/languages';
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  // Existing v1 workspaces have C++ problems without a language field.
  problems: z.array(
    z.object({
      id: identifier,
      title: z.string().max(200),
      language: z.enum(languageIds).default('cpp'),
      importedAt: z.number().optional(),
    }),
  ),
});
const testSchema = z.object({
  id: identifier,
  input: z.string().max(1_000_000),
  expected: z.string().max(1_000_000).optional(),
});
export class FileWorkspaceStore implements WorkspaceStore {
  private static writes = new Map<string, Promise<unknown>>();
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const key = this.manifestPath();
    const next = (FileWorkspaceStore.writes.get(key) || Promise.resolve()).then(operation);
    const settled = next.catch(() => {});
    FileWorkspaceStore.writes.set(key, settled);
    void settled.then(() => {
      if (FileWorkspaceStore.writes.get(key) === settled) FileWorkspaceStore.writes.delete(key);
    });
    return next;
  }
  constructor(
    readonly root: string,
    readonly contestId?: number,
    readonly collection?: 'standalone',
  ) {}
  private manifestPath() {
    return path.join(this.root, '.cfide', 'workspace.json');
  }
  sourcePath(id: string, language: Language = 'cpp') {
    return path.join(
      this.root,
      identifier.parse(id),
      ...(this.contestId ? ['solutions'] : []),
      languages[language].sourceFile,
    );
  }
  private async manifest() {
    try {
      return manifestSchema.parse(JSON.parse(await fs.readFile(this.manifestPath(), 'utf8')));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        return { schemaVersion: 1 as const, problems: [] };
      throw e;
    }
  }
  private async atomic(file: string, value: string) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, value, 'utf8');
    await fs.rename(temp, file);
  }
  private decorate(problem: {
    id: string;
    title: string;
    language: Language;
    importedAt?: number;
  }): Problem {
    return {
      ...problem,
      ...(this.contestId ? { contestId: this.contestId } : {}),
      ...(this.collection ? { collection: this.collection } : {}),
    };
  }
  async listProblems(): Promise<Problem[]> {
    const problems = await Promise.all(
      (await this.manifest()).problems.map(async (problem) => {
        if (problem.importedAt === undefined) {
          const stat = await fs.stat(path.join(this.root, problem.id)).catch(() => undefined);
          problem.importedAt = stat?.birthtimeMs || stat?.mtimeMs || 0;
        }
        return this.decorate(problem);
      }),
    );
    return newestImportedFirst(problems);
  }
  async renameProblem(id: string, title: string) {
    await this.exclusive(async () => {
      const manifest = await this.manifest();
      const problem = manifest.problems.find((p) => p.id === id);
      if (!problem) throw new Error('Unknown problem.');
      problem.title = z.string().min(1).max(200).parse(title);
      await this.atomic(this.manifestPath(), JSON.stringify(manifest, null, 2));
    });
  }
  async createProblem(id: string, title: string, source: string, language: Language = 'cpp') {
    return this.exclusive(async () => {
      identifier.parse(id);
      z.enum(languageIds).parse(language);
      z.string().min(1).max(200).parse(title);
      const manifest = await this.manifest();
      if (manifest.problems.some((p) => p.id === id))
        throw new Error(`Problem ${id} already exists.`);
      const folder = path.join(this.root, id);
      await fs.mkdir(folder); // Do not adopt or overwrite an existing user directory.
      if (this.contestId) await fs.mkdir(path.join(folder, 'solutions'));
      await fs.writeFile(this.sourcePath(id, language), source, { flag: 'wx' });
      const importedAt = importTimestamp(
        Math.max(0, ...manifest.problems.map((p) => p.importedAt ?? 0)),
      );
      const problem = { id, title: z.string().min(1).max(200).parse(title), language, importedAt };
      manifest.problems.push(problem);
      await this.atomic(this.manifestPath(), JSON.stringify(manifest, null, 2));
      return this.decorate(problem);
    });
  }
  async selectLanguage(id: string, language: Language, template: string) {
    return this.exclusive(async () => {
      z.enum(languageIds).parse(language);
      const manifest = await this.manifest(),
        problem = manifest.problems.find((p) => p.id === id);
      if (!problem) throw new Error('Unknown problem.');
      try {
        await fs.writeFile(this.sourcePath(id, language), template, { flag: 'wx' });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
      problem.language = language;
      await this.atomic(this.manifestPath(), JSON.stringify(manifest, null, 2));
      return this.decorate(problem);
    });
  }
  private testsPath(id: string, testId?: string) {
    identifier.parse(id);
    return path.join(
      this.root,
      id,
      'tests',
      ...(this.contestId && testId ? [testId.startsWith('sample-') ? 'samples' : 'custom'] : []),
    );
  }
  async listTests(id: string): Promise<TestCase[]> {
    if (this.contestId) {
      const all: TestCase[] = [];
      for (const group of ['samples', 'custom']) {
        const folder = path.join(this.testsPath(id), group);
        let files: string[];
        try {
          files = await fs.readdir(folder);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
        for (const file of files.filter((f) => f.endsWith('.in')).sort()) {
          const testId = identifier.parse(file.slice(0, -3));
          let expected: string | undefined;
          try {
            expected = await fs.readFile(path.join(folder, `${testId}.out`), 'utf8');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
          all.push({
            id: testId,
            input: await fs.readFile(path.join(folder, file), 'utf8'),
            expected,
            readOnly: group === 'samples',
          });
        }
      }
      return all;
    }
    let entries: string[];
    try {
      entries = await fs.readdir(this.testsPath(id));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    return Promise.all(
      entries
        .filter((n) => n.endsWith('.in'))
        .sort()
        .map(async (n) => {
          const testId = identifier.parse(n.slice(0, -3));
          const base = path.join(this.testsPath(id), testId);
          let expected: string | undefined;
          try {
            expected = await fs.readFile(`${base}.out`, 'utf8');
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
          }
          return { id: testId, input: await fs.readFile(`${base}.in`, 'utf8'), expected };
        }),
    );
  }
  async saveTest(id: string, test: TestCase) {
    testSchema.parse(test);
    if (this.contestId && test.id.startsWith('sample-'))
      throw new Error('Official samples are read-only. Add a custom test instead.');
    const base = path.join(this.testsPath(id, test.id), test.id);
    await this.atomic(`${base}.in`, test.input);
    if (test.expected === undefined) await fs.rm(`${base}.out`, { force: true });
    else await this.atomic(`${base}.out`, test.expected);
  }
  async deleteTest(id: string, testId: string) {
    if (this.contestId && testId.startsWith('sample-'))
      throw new Error('Official samples cannot be deleted.');
    const base = path.join(this.testsPath(id, testId), identifier.parse(testId));
    await Promise.all(['in', 'out'].map((ext) => fs.rm(`${base}.${ext}`, { force: true })));
  }
  async importSamples(id: string, samples: TestCase[]) {
    for (const test of samples) {
      testSchema.parse(test);
      const folder = this.testsPath(id, test.id);
      await this.atomic(path.join(folder, `${test.id}.in`), test.input);
      await this.atomic(path.join(folder, `${test.id}.out`), test.expected ?? '');
    }
    // Remove obsolete official samples only, never custom tests or sources.
    const folder = path.join(this.testsPath(id), 'samples');
    const names = new Set(samples.flatMap((t) => [`${t.id}.in`, `${t.id}.out`]));
    try {
      for (const file of await fs.readdir(folder))
        if (/^sample-\d+\.(in|out)$/.test(file) && !names.has(file))
          await fs.rm(path.join(folder, file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
