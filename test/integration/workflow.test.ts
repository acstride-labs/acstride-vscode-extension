import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileWorkspaceStore } from '../../src/infrastructure/storage/file-workspace-store';
import { CppRunner } from '../../src/infrastructure/execution/cpp-runner';
import { RunTests } from '../../src/application/run-tests';
import { executeProcess } from '../../src/infrastructure/execution/process-executor';
const folders: string[] = [];
async function workspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codeforces-workbench-test-'));
  folders.push(root);
  return new FileWorkspaceStore(root);
}
afterEach(async () => {
  await Promise.all(folders.splice(0).map((p) => fs.rm(p, { recursive: true, force: true })));
});
describe('local C++ workflow', () => {
  it('creates, restores, edits tests, compiles, compares and deletes tests', async () => {
    const store = await workspace();
    await store.createProblem(
      'A',
      'Sum',
      '#include <iostream>\nint main(){ long long a,b; std::cin>>a>>b; std::cout<<a+b<<"\\n"; }',
    );
    await store.saveTest('A', { id: 'sample-1', input: '2 3', expected: '5' });
    await store.saveTest('A', { id: 'custom-1', input: '2 3', expected: '6' });
    await store.saveTest('A', { id: 'run-only', input: '4 7' });
    const restored = new FileWorkspaceStore(store.root);
    expect(await restored.listProblems()).toEqual([
      { id: 'A', title: 'Sum', language: 'cpp', importedAt: expect.any(Number) },
    ]);
    const result = await new RunTests(restored, new CppRunner()).execute(
      'A',
      { command: process.env.CXX || 'g++', args: ['-std=c++20'], timeoutMs: 1000 },
      new AbortController().signal,
    );
    expect(result.compileError).toBeUndefined();
    expect(result.results.map((r) => r.verdict)).toEqual(['WA', 'RAN', 'AC']);
    expect(result.results[0].difference).toEqual({ token: 1, expected: '6', actual: '5' });
    await store.saveTest('A', { id: 'sample-1', input: '2 3' });
    expect((await store.listTests('A')).find((t) => t.id === 'sample-1')?.expected).toBeUndefined();
    await store.deleteTest('A', 'custom-1');
    expect(await store.listTests('A')).toHaveLength(2);
    await expect(store.createProblem('A', 'Duplicate', 'overwritten')).rejects.toThrow(
      'already exists',
    );
    await expect(store.saveTest('../escape', { id: 'x', input: '' })).rejects.toThrow();
  }, 30000);
  it('reports compile errors, runtime errors and timeouts', async () => {
    const store = await workspace(),
      runner = new CppRunner();
    await store.createProblem('A', 'Errors', 'not valid C++');
    const config = { command: process.env.CXX || 'g++', args: ['-std=c++20'], timeoutMs: 1000 };
    const run = () =>
      runner.run(
        store.sourcePath('A'),
        [{ id: 't', input: '', expected: '' }],
        config,
        new AbortController().signal,
      );
    expect((await run()).compileError).toBeTruthy();
    await fs.writeFile(store.sourcePath('A'), 'int main(){return 7;}');
    expect((await run()).results[0].verdict).toBe('RE');
    await fs.writeFile(
      store.sourcePath('A'),
      'int main(){volatile unsigned long long n=0; for(;;){n=n+1;}}',
    );
    expect((await run()).results[0].verdict).toBe('TLE');
  }, 30000);
  it('limits output and cancels a running process', async () => {
    const store = await workspace();
    const limited = await executeProcess(
      process.execPath,
      ['-e', 'process.stdout.write("x".repeat(20000))'],
      { cwd: store.root, signal: new AbortController().signal, timeoutMs: 3000, outputLimit: 1000 },
    );
    expect(limited.reason).toBe('output');
    expect(limited.stdout.length).toBeLessThanOrEqual(1000);
    const abort = new AbortController();
    const pending = executeProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      cwd: store.root,
      signal: abort.signal,
      timeoutMs: 5000,
    });
    setTimeout(() => abort.abort(), 100);
    expect((await pending).reason).toBe('cancelled');
    await expect(
      executeProcess('codeforces-workbench-nonexistent-compiler', [], {
        cwd: store.root,
        signal: new AbortController().signal,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow('Cannot start');
  });
});
