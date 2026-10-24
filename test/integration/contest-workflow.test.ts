import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ContestRepository } from '../../src/infrastructure/storage/contest-repository';
import { ContestService } from '../../src/application/contest-service';
import { fixtureContest, structuredProblem } from '../fixtures/codeforces';
import type { CFSubmission, Contest } from '../../src/domain/contest';

const folders: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(folders.splice(0).map((p) => fs.rm(p, { recursive: true, force: true })));
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-contest-test-'));
  folders.push(root);
  const repo = new ContestRepository(root);
  const api = {
    contest: vi.fn(async (id: number): Promise<Contest> => ({ ...fixtureContest, id })),
    standings: vi.fn(async (id: number) => ({
      contest: { ...fixtureContest, id },
      problems: [
        { index: 'A', name: 'Sum' },
        { index: 'B', name: 'Other' },
      ],
      rows: [],
      fetchedAt: Date.now(),
    })),
    submissions: vi.fn(async (): Promise<CFSubmission[]> => []),
  };
  const session = {
    problem: vi.fn(async () => structuredProblem()),
  };
  const changed = vi.fn();
  const service = new ContestService(
    repo,
    api,
    session,
    async (language) => (language === 'cpp' ? 'int main(){}' : 'print(5)'),
    changed,
  );
  return { root, repo, api, session, service, changed };
}
describe('multiple contest workspace', () => {
  it('replaces cached browser/login instructions when opening older contests', async () => {
    const { repo, service } = await fixture();
    await service.add(1234, 'cpp');
    await repo.update(1234, (record) => {
      record.error = 'Could not connect to the dedicated Chrome.';
      record.problems = [
        {
          index: 'A',
          name: 'Sum',
          ready: false,
          downloadAttempts: 0,
          nextRetryAt: 0,
          error: 'Dedicated browser is not connected. Open it and click Connect after signing in.',
        },
      ];
    });
    const record = await repo.get(1234);
    expect(record.error).toContain('built-in downloader');
    expect(record.problems[0].error).toContain('No login/browser connection is needed');
  });
  it('tracks public submissions without fetching any authenticated pages', async () => {
    const { repo, service, api, session } = await fixture();
    await service.add(1234, 'cpp');
    api.submissions.mockResolvedValue([
      {
        id: 42,
        creationTimeSeconds: 1,
        problem: { index: 'A' },
        programmingLanguage: 'GNU C++20',
        verdict: 'OK',
        testset: 'TESTS',
      },
    ]);
    await service.refreshSubmissions(1234, 'public-handle');
    expect((await repo.submissions(1234, 'public-handle')).submissions[0].id).toBe(42);
    expect(session.problem).not.toHaveBeenCalled();
  });
  it('retries a failed download while preserving code and custom tests', async () => {
    const { repo, service, session } = await fixture();
    await service.add(1234, 'python');
    session.problem.mockRejectedValue(new Error('Anonymous download blocked'));
    await service.sync(1234);
    const store = repo.problems(1234);
    await fs.writeFile(store.sourcePath('A', 'python'), 'print("keep solution")');
    await store.saveTest('A', { id: 'custom-1', input: '1', expected: '2' });
    session.problem.mockResolvedValue(structuredProblem('A. Sum'));
    await service.sync(1234, 'A');
    expect((await repo.get(1234)).problems[0].ready).toBe(true);
    expect(await fs.readFile(store.sourcePath('A', 'python'), 'utf8')).toBe(
      'print("keep solution")',
    );
    expect((await store.listTests('A')).map((t) => t.id)).toEqual(['sample-1', 'custom-1']);
  });
  it('preserves the manifest when importing and switching languages concurrently', async () => {
    const { repo, service } = await fixture();
    await service.add(1234, 'cpp');
    await repo.problems(1234).createProblem('A', 'First', 'int main(){}');
    await Promise.all([
      repo.problems(1234).selectLanguage('A', 'python', 'print(5)'),
      repo.problems(1234).createProblem('B', 'Second', 'int main(){}'),
    ]);
    expect(await repo.problems(1234).listProblems()).toMatchObject([
      { id: 'B', language: 'cpp' },
      { id: 'A', language: 'python' },
    ]);
  });
  it('isolates identical indices between contests and preserves both languages/custom tests on reimport', async () => {
    const { repo, service, session } = await fixture();
    await service.add(1234, 'cpp');
    await service.add(5678, 'python');
    await service.sync(1234);
    await service.sync(5678);
    expect((await repo.list()).map((c) => c.contest.id)).toEqual([1234, 5678]);
    const first = repo.problems(1234),
      second = repo.problems(5678);
    expect(first.sourcePath('A', 'cpp')).toContain(
      path.join('contests', '1234', 'A', 'solutions', 'main.cpp'),
    );
    expect(second.sourcePath('A', 'python')).toContain(
      path.join('5678', 'A', 'solutions', 'main.py'),
    );
    await fs.writeFile(first.sourcePath('A'), '// keep my source');
    await first.selectLanguage('A', 'python', 'print("keep python")');
    await first.saveTest('A', { id: 'custom-1', input: '1', expected: '2' });
    session.problem.mockResolvedValue(structuredProblem('A. Updated', '9'));
    await service.sync(1234, 'A');
    expect(await fs.readFile(first.sourcePath('A'), 'utf8')).toBe('// keep my source');
    expect(await fs.readFile(first.sourcePath('A', 'python'), 'utf8')).toBe('print("keep python")');
    const tests = await first.listTests('A');
    expect(tests.find((t) => t.id === 'custom-1')?.expected).toBe('2');
    expect(tests.find((t) => t.id === 'sample-1')).toMatchObject({
      expected: '9\n',
      readOnly: true,
    });
    await expect(first.saveTest('A', { id: 'sample-1', input: '' })).rejects.toThrow('read-only');
    expect((await repo.get(1234)).problems.every((p) => p.ready)).toBe(true);
  });
  it('keeps successful downloads when another problem fails and retries only the missing problem', async () => {
    const { repo, service, session } = await fixture();
    await service.add(1234, 'cpp');
    session.problem
      .mockResolvedValueOnce(structuredProblem())
      .mockRejectedValueOnce(new Error('Temporary site error'));
    await service.sync(1234);
    const partial = await repo.get(1234);
    expect(partial.problems[0].ready).toBe(true);
    expect(partial.problems[1].error).toContain('Temporary');
    expect(partial.nextRetryAt).toBeGreaterThan(Date.now());
    await service.ensureDownloaded(1234, 'B');
    expect(session.problem).toHaveBeenCalledTimes(3);
    expect((await repo.get(1234)).error).toBeUndefined();
  });
  it('allows coding and custom tests when all statement downloads fail, without pretending samples exist', async () => {
    const { repo, service, session } = await fixture();
    await service.add(1234, 'python');
    session.problem.mockRejectedValue(new Error('Website HTTP 403'));
    await service.sync(1234);
    expect((await repo.get(1234)).problems.every((p) => !p.ready && p.error?.includes('403'))).toBe(
      true,
    );
    const problem = await service.ensureSolution(1234, 'A');
    expect(problem.language).toBe('python');
    const store = repo.problems(1234);
    expect(await fs.readFile(store.sourcePath('A', 'python'), 'utf8')).toBe('print(5)');
    expect(await store.listTests('A')).toEqual([]);
    await store.saveTest('A', { id: 'custom-1', input: '2 3', expected: '5' });
    await fs.writeFile(store.sourcePath('A', 'python'), 'print("keep me")');
    await service.sync(1234);
    expect(await fs.readFile(store.sourcePath('A', 'python'), 'utf8')).toBe('print("keep me")');
    expect(await store.listTests('A')).toHaveLength(1);
    await expect(service.ensureSolution(1234, 'Z')).rejects.toThrow('not been released');
  });
  it('waits for release and pauses only archived contests', async () => {
    const { repo, service, api, session } = await fixture();
    const future = {
      ...fixtureContest,
      phase: 'BEFORE' as const,
      startTimeSeconds: Math.floor(Date.now() / 1000) + 3600,
    };
    api.contest.mockResolvedValue(future);
    await service.add(1234, 'cpp');
    await service.tick();
    expect(session.problem).not.toHaveBeenCalled();
    await repo.update(1234, (r) => {
      r.contest = fixtureContest;
      r.archived = true;
    });
    await service.tick();
    expect(session.problem).not.toHaveBeenCalled();
    await repo.update(1234, (r) => {
      r.archived = false;
    });
    api.contest.mockResolvedValue(fixtureContest);
    await service.tick();
    expect(session.problem).toHaveBeenCalledTimes(2);
  });
  it('resumes a persisted overdue contest and retains cache after API failure', async () => {
    const { root, repo, service, api } = await fixture();
    await service.add(1234, 'python');
    const restored = new ContestRepository(root);
    expect((await restored.get(1234)).defaultLanguage).toBe('python');
    await service.tick();
    expect((await restored.get(1234)).problems[0].ready).toBe(true);
    api.standings.mockRejectedValue(new Error('Offline'));
    await service.sync(1234);
    expect(await restored.statement(1234, 'A')).not.toBeNull();
    expect((await restored.get(1234)).error).toBe('Offline');
  });
});

it('automatically retries each missing problem four times, persists exhaustion and restarts on selection', async () => {
  vi.useFakeTimers();
  const { repo, service, session, api, root } = await fixture();
  await service.add(1234, 'python');
  session.problem.mockRejectedValue(new Error('Temporary unavailable'));
  for (let i = 0; i < 4; i++) {
    await service.tick();
    vi.setSystemTime(Date.now() + 20000);
  }
  expect(session.problem).toHaveBeenCalledTimes(8);
  expect(
    (await new ContestRepository(root).get(1234)).problems.every((p) => p.downloadAttempts === 4),
  ).toBe(true);
  await service.tick();
  expect(session.problem).toHaveBeenCalledTimes(8);
  session.problem.mockResolvedValue(structuredProblem());
  api.standings.mockRejectedValue(new Error('Ranking unavailable'));
  await Promise.all([service.ensureDownloaded(1234, 'A'), service.ensureDownloaded(1234, 'A')]);
  expect(session.problem).toHaveBeenCalledTimes(9);
  expect((await repo.get(1234)).problems[0]).toMatchObject({ ready: true, downloadAttempts: 0 });
});

it('ignores old disabled auto-download settings without losing saved workspace data', async () => {
  const { repo, service } = await fixture();
  await service.add(1234, 'cpp');
  const metadata = path.join(repo.contestRoot(1234), '.cfide', 'contest.json');
  const old = JSON.parse(await fs.readFile(metadata, 'utf8'));
  old.autoDownload = false;
  old.retryCount = 200;
  old.nextRetryAt = Date.now() + 3600000;
  await fs.writeFile(metadata, JSON.stringify(old));
  await service.tick();
  expect((await repo.get(1234)).problems.every((p) => p.ready)).toBe(true);
  expect(await repo.get(1234)).not.toHaveProperty('autoDownload');
});

it('recovers an interrupted final attempt without showing a permanent loading state', async () => {
  const { repo, service, session } = await fixture();
  await service.add(1234, 'python');
  await repo.update(1234, (r) => {
    r.contest.phase = 'FINISHED';
    r.problems = [{ index: 'A', name: 'Sum', ready: false, downloadAttempts: 4, nextRetryAt: 0 }];
  });
  await service.tick();
  expect(session.problem).toHaveBeenCalledOnce();
  expect((await repo.get(1234)).problems[0].ready).toBe(true);
});

it('queues both distinct selected problems even when background work is archived', async () => {
  const { repo, service, session } = await fixture();
  await service.add(1234, 'python');
  await repo.update(1234, (r) => {
    r.archived = true;
    r.contest.phase = 'FINISHED';
    r.problems = ['A', 'B'].map((index) => ({
      index,
      name: index,
      ready: false,
      downloadAttempts: 0,
      nextRetryAt: 0,
    }));
  });
  await Promise.all([service.ensureDownloaded(1234, 'A'), service.ensureDownloaded(1234, 'B')]);
  expect(session.problem).toHaveBeenCalledTimes(2);
  expect((await repo.get(1234)).problems.every((p) => p.ready)).toBe(true);
});
