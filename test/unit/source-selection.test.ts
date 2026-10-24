import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Language, Problem } from '../../src/domain/models';
const mock = vi.hoisted(() => ({
  documents: new Map<string, { isDirty: boolean; save: () => Promise<boolean> }>(),
  clipboard: vi.fn(async (_text: string) => {}),
  external: vi.fn(async (_uri: unknown) => true),
  cppRun: vi.fn(async (_source: string) => ({ runId: 'cpp', results: [] })),
  pythonRun: vi.fn(async (_source: string) => ({ runId: 'python', results: [] })),
}));
vi.mock('vscode', () => ({
  workspace: {
    isTrusted: true,
    openTextDocument: async (uri: { fsPath: string }) => mock.documents.get(uri.fsPath),
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
  },
  Uri: { file: (fsPath: string) => ({ fsPath }), parse: (url: string) => url },
  env: { language: 'en', clipboard: { writeText: mock.clipboard }, openExternal: mock.external },
}));
vi.mock('../../src/infrastructure/execution/cpp-runner', () => ({
  CppRunner: class {
    run = mock.cppRun;
  },
}));
vi.mock('../../src/infrastructure/execution/python-runner', () => ({
  PythonRunner: class {
    run = mock.pythonRun;
  },
}));
import { WorkspaceController } from '../../src/vscode/workspace-controller';
import { FileWorkspaceStore } from '../../src/infrastructure/storage/file-workspace-store';
import { RunTests } from '../../src/application/run-tests';

const folders: string[] = [];
afterEach(async () => {
  mock.documents.clear();
  mock.clipboard.mockClear();
  mock.external.mockClear();
  mock.cppRun.mockClear();
  mock.pythonRun.mockClear();
  await Promise.all(
    folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })),
  );
});
async function fixture(language: Language) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-source-selection-'));
  folders.push(folder);
  const store = new FileWorkspaceStore(folder, 7);
  await store.createProblem('A', 'Test', '// saved C++', 'cpp');
  await store.selectLanguage('A', 'python', '# saved Python');
  const problem: Problem = { id: 'A', title: 'Test', language, contestId: 7 };
  const controller = Object.assign(Object.create(WorkspaceController.prototype), {
    current: problem,
    scopedStore: store,
    submitHandler: vi.fn(async () => {}),
    output: { appendLine: () => {} },
  });
  return { controller: controller as WorkspaceController, store, problem };
}
describe('selected source and automatic saving', () => {
  for (const language of ['cpp', 'python'] as const) {
    it(`saves ${language} before Run all and uses its matching runner/source`, async () => {
      const { controller, store, problem } = await fixture(language);
      await store.saveTest('A', { id: 'sample', input: '', expected: '' });
      const source = store.sourcePath('A', language),
        code = `${language} live buffer`;
      const save = vi.fn(async () => {
        await fs.writeFile(source, code);
        return true;
      });
      mock.documents.set(source, { isDirty: true, save });
      await (controller as unknown as { run(id: undefined, target: Problem): Promise<void> }).run(
        undefined,
        problem,
      );
      const runner = language === 'cpp' ? mock.cppRun : mock.pythonRun;
      expect(save).toHaveBeenCalledOnce();
      expect(runner.mock.calls[0][0]).toBe(source);
      expect(await fs.readFile(source, 'utf8')).toBe(code);
      expect(language === 'cpp' ? mock.pythonRun : mock.cppRun).not.toHaveBeenCalled();
    });
    it(`saves and submits the selected ${language} buffer, not the other language`, async () => {
      const { controller, store, problem } = await fixture(language);
      const source = store.sourcePath('A', language),
        code = `${language} unsaved edits\n`;
      const save = vi.fn(async () => {
        await fs.writeFile(source, code);
        return true;
      });
      mock.documents.set(source, { isDirty: true, save });
      await controller.submitSolution(problem);
      expect(save).toHaveBeenCalledOnce();
      expect(controller.submitHandler).toHaveBeenCalledWith(
        expect.objectContaining({ source: code, file: source, problem }),
      );
      expect(mock.clipboard).not.toHaveBeenCalled();
      expect(mock.external).not.toHaveBeenCalled();
      const other = language === 'cpp' ? 'python' : 'cpp';
      expect(await fs.readFile(store.sourcePath('A', other), 'utf8')).toBe(
        other === 'cpp' ? '// saved C++' : '# saved Python',
      );
    });
  }
  it('refuses a stale language or contest target before submitting a different file', async () => {
    const { controller, problem } = await fixture('cpp');
    await expect(controller.submitSolution({ ...problem, language: 'python' })).rejects.toThrow(
      'language changed',
    );
    await expect(controller.submitSolution({ ...problem, contestId: 8 })).rejects.toThrow(
      'language changed',
    );
    expect(mock.clipboard).not.toHaveBeenCalled();
    expect(mock.external).not.toHaveBeenCalled();
  });
  it('refuses a stale run target before touching any source or runner', async () => {
    const { controller, problem } = await fixture('cpp');
    await expect(
      (controller as unknown as { run(id: undefined, target: Problem): Promise<void> }).run(
        undefined,
        { ...problem, language: 'python' },
      ),
    ).rejects.toThrow('language changed');
    expect(mock.cppRun).not.toHaveBeenCalled();
    expect(mock.pythonRun).not.toHaveBeenCalled();
  });
  it('does not submit if saving the source fails', async () => {
    const { controller, store, problem } = await fixture('python');
    mock.documents.set(store.sourcePath('A', 'python'), { isDirty: true, save: async () => false });
    await expect(controller.submitSolution(problem)).rejects.toThrow('Could not save source');
    expect(mock.clipboard).not.toHaveBeenCalled();
    expect(mock.external).not.toHaveBeenCalled();
  });
  it('uses the captured run language even when the persisted selection differs', async () => {
    const { store } = await fixture('cpp'); // Persisted metadata currently says Python.
    await store.saveTest('A', { id: 'case-1', input: '', expected: '' });
    const run = vi.fn(async (_source: string) => ({ runId: 'test', results: [] }));
    await new RunTests(store, { run }).execute(
      'A',
      { command: 'g++', args: [], timeoutMs: 1000 },
      new AbortController().signal,
      undefined,
      undefined,
      'cpp',
    );
    expect(run.mock.calls[0][0]).toBe(store.sourcePath('A', 'cpp'));
  });
});
