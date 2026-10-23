import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ContestRepository } from '../../src/infrastructure/storage/contest-repository';
import { ContestService } from '../../src/application/contest-service';
import { SubmissionRejectedError } from '../../src/infrastructure/codeforces/session-client';
import { fixtureContest, statementHtml } from '../fixtures/codeforces';
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
    handle: 'tester',
    page: vi.fn(async () => ({ html: statementHtml(), url: 'https://codeforces.com' })),
    submit: vi.fn(async () => ({ submissionId: 777 })),
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
  it('preserves the manifest when importing and switching languages concurrently', async () => {
    const { repo, service } = await fixture();
    await service.add(1234, 'cpp');
    await repo.problems(1234).createProblem('A', 'First', 'int main(){}');
    await Promise.all([
      repo.problems(1234).selectLanguage('A', 'python', 'print(5)'),
      repo.problems(1234).createProblem('B', 'Second', 'int main(){}'),
    ]);
    expect(await repo.problems(1234).listProblems()).toMatchObject([
      { id: 'A', language: 'python' },
      { id: 'B', language: 'cpp' },
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
    session.page.mockResolvedValue({
      html: statementHtml('A. Updated', '9'),
      url: 'https://codeforces.com',
    });
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
    session.page
      .mockResolvedValueOnce({ html: statementHtml(), url: 'https://codeforces.com' })
      .mockRejectedValueOnce(new Error('Temporary site error'));
    await service.sync(1234);
    const partial = await repo.get(1234);
    expect(partial.problems[0].ready).toBe(true);
    expect(partial.problems[1].error).toContain('Temporary');
    expect(partial.nextRetryAt).toBeGreaterThan(Date.now());
    await service.sync(1234);
    expect(session.page).toHaveBeenCalledTimes(3);
    expect((await repo.get(1234)).error).toBeUndefined();
  });
  it('waits for release and respects archive/auto-download settings', async () => {
    const { repo, service, api, session } = await fixture();
    const future = {
      ...fixtureContest,
      phase: 'BEFORE' as const,
      startTimeSeconds: Math.floor(Date.now() / 1000) + 3600,
    };
    api.contest.mockResolvedValue(future);
    await service.add(1234, 'cpp');
    await service.tick();
    expect(session.page).not.toHaveBeenCalled();
    await repo.update(1234, (r) => {
      r.contest = fixtureContest;
      r.archived = true;
    });
    await service.tick();
    expect(session.page).not.toHaveBeenCalled();
    await repo.update(1234, (r) => {
      r.archived = false;
      r.autoDownload = false;
    });
    await service.tick();
    expect(session.page).not.toHaveBeenCalled();
    api.contest.mockResolvedValue(fixtureContest);
    await repo.update(1234, (r) => {
      r.autoDownload = true;
    });
    await service.tick();
    expect(session.page).toHaveBeenCalledTimes(2);
  });
  it('resumes a persisted overdue contest and retains cache after API failure', async () => {
    const { root, repo, service, api } = await fixture();
    await service.add(1234, 'python');
    const restored = new ContestRepository(root);
    expect((await restored.get(1234)).defaultLanguage).toBe('python');
    await service.tick();
    expect((await restored.get(1234)).problems[0].ready).toBe(true);
    api.standings.mockRejectedValue(new Error('Offline'));
    await service.sync(1234, 'A');
    expect(await restored.statement(1234, 'A')).not.toBeNull();
    expect((await restored.get(1234)).error).toBe('Offline');
  });
});
describe('submission receipts', () => {
  it('saves an exact immutable snapshot and associates only a definite receipt ID', async () => {
    const { repo, service, session } = await fixture();
    await service.add(1234, 'python');
    const attempt = await service.submit(
      1234,
      'A',
      'python',
      '998',
      'PyPy 3 fixture',
      'print(123)\n',
      new URLSearchParams(),
    );
    expect(attempt).toMatchObject({
      state: 'confirmed',
      submissionId: 777,
      handle: 'tester',
      programTypeId: '998',
    });
    expect(await fs.readFile(repo.snapshotPath(attempt), 'utf8')).toBe('print(123)\n');
    expect(session.submit).toHaveBeenCalledTimes(1);
    expect((await repo.attempts(1234))[0].sourceHash).toHaveLength(64);
  });
  it('does not retry an uncertain POST or auto-link similar submissions; blocks a duplicate', async () => {
    const { repo, service, session, api } = await fixture();
    await service.add(1234, 'cpp');
    session.submit.mockRejectedValue(new Error('Connection lost after send'));
    const attempt = await service.submit(
      1234,
      'A',
      'cpp',
      '999',
      'GNU fixture',
      'int main(){}',
      new URLSearchParams(),
    );
    expect(attempt.state).toBe('uncertain');
    api.submissions.mockResolvedValue([
      {
        id: 888,
        contestId: 1234,
        creationTimeSeconds: Math.floor(Date.now() / 1000),
        programmingLanguage: 'GNU fixture',
        problem: { index: 'A' },
        verdict: 'TESTING',
      },
    ]);
    await service.refreshSubmissions(1234, 'tester');
    const persisted = (await repo.attempts(1234))[0];
    expect(persisted.state).toBe('uncertain');
    expect(persisted.submissionId).toBeUndefined();
    expect(persisted.message).toContain('888');
    await expect(
      service.submit(1234, 'A', 'cpp', '999', 'GNU fixture', 'new source', new URLSearchParams()),
    ).rejects.toThrow('Resolve');
    expect(session.submit).toHaveBeenCalledTimes(1);
  });
  it('serializes duplicate clicks and records definite form rejection', async () => {
    const { repo, service, session } = await fixture();
    await service.add(1234, 'cpp');
    session.submit.mockRejectedValue(new SubmissionRejectedError('Same source already submitted'));
    const first = service.submit(
      1234,
      'A',
      'cpp',
      '999',
      'GNU fixture',
      'source',
      new URLSearchParams(),
    );
    await expect(
      service.submit(1234, 'A', 'cpp', '999', 'GNU fixture', 'source', new URLSearchParams()),
    ).rejects.toThrow('progress');
    expect((await first).state).toBe('rejected');
    expect(session.submit).toHaveBeenCalledTimes(1);
  });
  it('reconciles an uncertain receipt only after verifying the official source', async () => {
    const { repo, service, session, api } = await fixture();
    await service.add(1234, 'cpp');
    session.submit.mockRejectedValue(new Error('Lost receipt'));
    await service.submit(
      1234,
      'A',
      'cpp',
      '999',
      'GNU fixture',
      'int main(){}',
      new URLSearchParams(),
    );
    api.submissions.mockResolvedValue([
      {
        id: 888,
        creationTimeSeconds: Math.floor(Date.now() / 1000),
        programmingLanguage: 'GNU fixture',
        problem: { index: 'A' },
      },
    ]);
    session.page.mockResolvedValue({
      html: '<pre id="program-source-text">int main(){}</pre>',
      url: 'https://codeforces.com',
    });
    await service.refreshSubmissions(1234, 'tester');
    expect((await repo.attempts(1234))[0]).toMatchObject({ state: 'confirmed', submissionId: 888 });
    expect(session.submit).toHaveBeenCalledTimes(1);
  });
});
