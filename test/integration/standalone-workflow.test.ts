import { afterEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ContestRepository } from '../../src/infrastructure/storage/contest-repository';
import { FileWorkspaceStore } from '../../src/infrastructure/storage/file-workspace-store';
import { ContestService } from '../../src/application/contest-service';
import { newestImportedFirst } from '../../src/domain/contest';
import { structuredProblem } from '../fixtures/codeforces';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acstride-single-'));
  roots.push(root);
  const repo = new ContestRepository(root, 'standalone');
  const contest = {
    id: 4,
    name: 'Practice',
    phase: 'FINISHED' as const,
    type: 'CF',
    durationSeconds: 7200,
  };
  const api = {
    contest: vi.fn(async () => contest),
    standings: vi.fn(async () => {
      throw new Error('Single imports must not fetch all problems');
    }),
    submissions: vi.fn(async () => []),
  };
  const reader = {
    problem: vi.fn(async (_id: number, index: string) => structuredProblem(`${index}. Sum`)),
  };
  const service = new ContestService(repo, api, reader, async (language) =>
    language === 'cpp' ? '// C++ source' : '# Python source',
  );
  return { root, repo, api, reader, service, contest };
}
it('imports only the requested problem, reuses downloads/samples and isolates contest solutions', async () => {
  const f = await fixture();
  await f.service.addProblem(4, 'A', 'python');
  await f.service.ensureDownloaded(4, 'A');
  const single = f.repo.problems(4);
  expect(await single.listProblems()).toMatchObject([
    {
      id: 'A',
      title: 'Sum',
      language: 'python',
      collection: 'standalone',
      importedAt: expect.any(Number),
    },
  ]);
  expect((await single.listTests('A'))[0]).toMatchObject({
    readOnly: true,
    input: '2 3\n',
    expected: '5\n',
  });
  expect((await f.repo.get(4)).problems.map((p) => p.index)).toEqual(['A']);
  expect(f.api.standings).not.toHaveBeenCalled();
  expect(f.reader.problem).toHaveBeenCalledOnce();
  const contests = new ContestRepository(f.root);
  await contests.add(f.contest, 'cpp');
  await contests.problems(4).createProblem('A', 'Contest A', '// independent contest code');
  expect(await fs.readFile(single.sourcePath('A', 'python'), 'utf8')).toBe('# Python source');
  expect(await fs.readFile(contests.problems(4).sourcePath('A'), 'utf8')).toBe(
    '// independent contest code',
  );
  expect((await contests.list()).map((r) => r.contest.id)).toEqual([4]);
});
it('sorts single imports newest first and does not reorder on reopen, refresh or language changes', async () => {
  const f = await fixture();
  await f.service.addProblem(4, 'A', 'cpp');
  const first = (await f.repo.problems(4).listProblems())[0];
  await f.service.addProblem(4, 'B', 'python');
  await f.service.addProblem(4, 'A', 'python');
  await f.service.ensureDownloaded(4, 'A');
  await f.repo.problems(4).selectLanguage('A', 'python', '# another solution');
  const restored = new ContestRepository(f.root, 'standalone');
  const problems = await restored.problems(4).listProblems();
  expect(problems.map((p) => p.id)).toEqual(['B', 'A']);
  expect(problems[1].importedAt).toBe(first.importedAt);
  expect(problems[0].language).toBe('python');
  expect(f.api.contest).toHaveBeenCalledOnce();
});
it('orders contests and local problems by original import time, including same-millisecond imports', async () => {
  const f = await fixture();
  const contests = new ContestRepository(f.root);
  await contests.add({ ...f.contest, id: 4 }, 'cpp');
  await contests.add({ ...f.contest, id: 5 }, 'python');
  const original = (await contests.get(4)).importedAt;
  await contests.update(4, (r) => {
    r.updatedAt = Date.now() + 100000;
  });
  await contests.add(f.contest, 'python');
  expect(newestImportedFirst(await contests.list()).map((r) => r.contest.id)).toEqual([5, 4]);
  expect((await contests.get(4)).importedAt).toBe(original);
  const local = new FileWorkspaceStore(f.root);
  await local.createProblem('A', 'First', '// A');
  await local.createProblem('B', 'Second', '# B', 'python');
  await local.selectLanguage('A', 'python', '# A');
  expect((await new FileWorkspaceStore(f.root).listProblems()).map((p) => p.id)).toEqual([
    'B',
    'A',
  ]);
});
it('derives a stable legacy import time from folder creation without using refreshed metadata time', async () => {
  const f = await fixture();
  const contests = new ContestRepository(f.root);
  await contests.add(f.contest, 'cpp');
  const file = path.join(contests.contestRoot(4), '.codeforces-workbench/contest.json');
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  delete saved.importedAt;
  await fs.writeFile(file, JSON.stringify(saved));
  const stamp = (await contests.get(4)).importedAt;
  await contests.update(4, (r) => {
    r.updatedAt += 999999;
  });
  expect((await new ContestRepository(f.root).get(4)).importedAt).toBe(stamp);
});
