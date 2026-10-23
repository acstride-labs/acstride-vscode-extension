import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { WorkspaceStore } from '../../application/ports/workspace-store';
import type { TestCase } from '../../domain/models';
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  problems: z.array(z.object({ id: identifier, title: z.string().max(200) })),
});
const testSchema = z.object({
  id: identifier,
  input: z.string().max(1_000_000),
  expected: z.string().max(1_000_000).optional(),
});
export class FileWorkspaceStore implements WorkspaceStore {
  constructor(readonly root: string) {}
  private manifestPath() {
    return path.join(this.root, '.cfide', 'workspace.json');
  }
  sourcePath(id: string) {
    return path.join(this.root, identifier.parse(id), 'main.cpp');
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
  async listProblems() {
    return (await this.manifest()).problems;
  }
  async createProblem(id: string, title: string, source: string) {
    identifier.parse(id);
    z.string().min(1).max(200).parse(title);
    const manifest = await this.manifest();
    if (manifest.problems.some((p) => p.id === id))
      throw new Error(`Problem ${id} already exists.`);
    const folder = path.dirname(this.sourcePath(id));
    await fs.mkdir(folder); // Do not adopt or overwrite an existing user directory.
    await fs.writeFile(this.sourcePath(id), source, { flag: 'wx' });
    const problem = { id, title: z.string().min(1).max(200).parse(title) };
    manifest.problems.push(problem);
    await this.atomic(this.manifestPath(), JSON.stringify(manifest, null, 2));
    return problem;
  }
  private testsPath(id: string) {
    identifier.parse(id);
    return path.join(this.root, id, 'tests');
  }
  async listTests(id: string): Promise<TestCase[]> {
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
    const base = path.join(this.testsPath(id), test.id);
    await this.atomic(`${base}.in`, test.input);
    if (test.expected === undefined) await fs.rm(`${base}.out`, { force: true });
    else await this.atomic(`${base}.out`, test.expected);
  }
  async deleteTest(id: string, testId: string) {
    const base = path.join(this.testsPath(id), identifier.parse(testId));
    await Promise.all(['in', 'out'].map((ext) => fs.rm(`${base}.${ext}`, { force: true })));
  }
}
