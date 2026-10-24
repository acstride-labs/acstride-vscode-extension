import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileWorkspaceStore } from '../../src/infrastructure/storage/file-workspace-store';
import { PythonRunner } from '../../src/infrastructure/execution/python-runner';
import { RunTests } from '../../src/application/run-tests';

const folders: string[] = [];
const config = {
  command: process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
  args: [],
  timeoutMs: 2000,
};
async function workspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codeforces-workbench-python-test-'));
  folders.push(root);
  return new FileWorkspaceStore(root);
}
afterEach(async () => {
  await Promise.all(folders.splice(0).map((p) => fs.rm(p, { recursive: true, force: true })));
});

describe('Python workflow', () => {
  it('persists mixed-language problems and runs the Python source through the application', async () => {
    const store = await workspace();
    await store.createProblem('A', 'C++', 'int main(){}');
    const template = await fs.readFile('resources/templates/default.py', 'utf8');
    await store.createProblem('B', 'Python', template, 'python');
    await store.saveTest('B', { id: 'ac', input: '2 3\n', expected: '5' });
    await store.saveTest('B', { id: 'wa', input: '2 3\n', expected: '6' });
    await store.saveTest('B', { id: 'run', input: '10 20\n' });
    const restored = new FileWorkspaceStore(store.root);
    expect((await restored.listProblems()).map((p) => p.language)).toEqual(['python', 'cpp']);
    expect(await fs.readFile(restored.sourcePath('B', 'python'), 'utf8')).toBe(template);
    const result = await new RunTests(restored, new PythonRunner()).execute(
      'B',
      config,
      new AbortController().signal,
    );
    expect(result.results.map((r) => r.verdict)).toEqual(['AC', 'RAN', 'WA']);
    expect(result.results[1].stdout.trim()).toBe('30');
    expect(result.results[2].difference).toEqual({ token: 1, expected: '6', actual: '5' });
    const single = await new RunTests(restored, new PythonRunner()).execute(
      'B',
      config,
      new AbortController().signal,
      undefined,
      'ac',
    );
    expect(single.results).toHaveLength(1);
  });
  it('opens legacy C++ workspaces without modifying their manifest', async () => {
    const store = await workspace();
    await fs.mkdir(path.join(store.root, '.codeforces-workbench'));
    const manifest = JSON.stringify({ schemaVersion: 1, problems: [{ id: 'A', title: 'Legacy' }] });
    await fs.writeFile(path.join(store.root, '.codeforces-workbench', 'workspace.json'), manifest);
    expect(await store.listProblems()).toEqual([
      { id: 'A', title: 'Legacy', language: 'cpp', importedAt: 0 },
    ]);
    expect(await fs.readFile(path.join(store.root, '.codeforces-workbench', 'workspace.json'), 'utf8')).toBe(
      manifest,
    );
    await store.createProblem('B', 'Python', 'print(1)', 'python');
    expect((await store.listProblems()).map((p) => p.language)).toEqual(['python', 'cpp']);
  });
  it('reports syntax/runtime errors, time limits, output limits and missing interpreters', async () => {
    const store = await workspace(),
      runner = new PythonRunner();
    await store.createProblem('A', 'Errors', 'def broken(:\n', 'python');
    const source = store.sourcePath('A', 'python');
    const run = () =>
      runner.run(
        source,
        [{ id: 't', input: '', expected: '' }],
        { ...config, timeoutMs: 1000 },
        new AbortController().signal,
      );
    const syntax = await run();
    expect(syntax.results[0].verdict).toBe('RE');
    expect(syntax.results[0].stderr).toContain('SyntaxError');
    await fs.writeFile(source, 'raise ValueError("example failure")\n');
    const runtime = await run();
    expect(runtime.results[0].verdict).toBe('RE');
    expect(runtime.results[0].stderr).toContain('example failure');
    await fs.writeFile(source, 'while True: pass\n');
    expect((await run()).results[0].verdict).toBe('TLE');
    await fs.writeFile(source, 'print("x" * 1100000)\n');
    expect((await run()).results[0].verdict).toBe('OLE');
    await expect(
      runner.run(
        source,
        [{ id: 't', input: '' }],
        { ...config, command: 'codeforces-workbench-missing-python' },
        new AbortController().signal,
      ),
    ).rejects.toThrow('Cannot start');
  }, 15000);
  it('supports UTF-8, interpreter arguments, sibling imports, and cancellation', async () => {
    const store = await workspace(),
      runner = new PythonRunner();
    await store.createProblem(
      'A',
      'UTF-8',
      'from helper import text\nimport sys\nprint(text, sys.flags.optimize)\n',
      'python',
    );
    const source = store.sourcePath('A', 'python');
    await fs.writeFile(path.join(store.root, 'A', 'helper.py'), 'text = "你好" * 20000\n');
    const result = await runner.run(
      source,
      [{ id: 't', input: '', expected: `${'你好'.repeat(20000)} 1` }],
      { ...config, args: ['-O'] },
      new AbortController().signal,
    );
    expect(result.results[0].verdict).toBe('AC');
    await fs.writeFile(source, 'import time\ntime.sleep(30)\n');
    const abort = new AbortController();
    const pending = runner.run(source, [{ id: 't', input: '' }], config, abort.signal);
    const timer = setTimeout(() => abort.abort(), 200);
    try {
      expect((await pending).cancelled).toBe(true);
    } finally {
      clearTimeout(timer);
    }
  });
});
