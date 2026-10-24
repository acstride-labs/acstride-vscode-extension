import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { FileWorkspaceStore } from '../../src/infrastructure/storage/file-workspace-store';
import { RunTests } from '../../src/application/run-tests';
import { JvmRunner } from '../../src/infrastructure/execution/jvm-runner';
import { kotlinCompiler } from '../../src/infrastructure/execution/kotlin-toolchain';
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })),
  );
});
for (const language of ['java', 'kotlin'] as const) {
  const command =
    language === 'java' ? process.env.JAVAC || 'javac' : process.env.KOTLINC || 'kotlinc';
  const runtimeCommand = process.env.JAVA || 'java';
  const launcher =
    language === 'kotlin'
      ? await kotlinCompiler(command, ['-version'], runtimeCommand)
      : { command, args: ['-version'] };
  const available = spawnSync(launcher.command, launcher.args, { timeout: 30000 }).status === 0;
  if (process.env.CI && !available) throw new Error(`CI requires a working ${command} toolchain`);
  describe.skipIf(!available)(`${language} workflow with real compiler`, () => {
    const config = { command, runtimeCommand, args: [], timeoutMs: 3000 };
    async function workspace(code: string) {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codeforces-workbench-jvm-test-'));
      folders.push(root);
      const store = new FileWorkspaceStore(root);
      await store.createProblem('A', language, code, language);
      return store;
    }
    it('persists the language, runs bundled code, compares output and selects a single case', async () => {
      const template = await fs.readFile(
        `resources/templates/default.${language === 'java' ? 'java' : 'kt'}`,
        'utf8',
      );
      const store = await workspace(template);
      await store.saveTest('A', { id: 'ac', input: '2 3\n', expected: '5' });
      await store.saveTest('A', { id: 'run', input: '10 20\n' });
      await store.saveTest('A', { id: 'wa', input: '2 3\n', expected: '6' });
      const restored = new FileWorkspaceStore(store.root);
      expect((await restored.listProblems())[0].language).toBe(language);
      const runner = new RunTests(restored, new JvmRunner(language));
      const result = await runner.execute('A', config, new AbortController().signal);
      expect(result.compileError).toBeUndefined();
      expect(result.results.map((r) => r.verdict)).toEqual(['AC', 'RAN', 'WA']);
      expect(result.results[1].stdout.trim()).toBe('30');
      expect(result.results[2].difference).toEqual({ token: 1, expected: '6', actual: '5' });
      const single = await runner.execute(
        'A',
        config,
        new AbortController().signal,
        undefined,
        'ac',
      );
      expect(single.results.map((r) => r.testId)).toEqual(['ac']);
      await store.selectLanguage('A', 'python', 'print(123)');
      await store.selectLanguage('A', language, 'do not overwrite');
      expect(await fs.readFile(store.sourcePath('A', language), 'utf8')).toBe(template);
    }, 60000);
    it('reports compilation failures without executing tests', async () => {
      const store = await workspace('this is invalid source');
      const result = await new JvmRunner(language).run(
        store.sourcePath('A', language),
        [{ id: 'x', input: '' }],
        config,
        new AbortController().signal,
      );
      expect(result.compileError).toBeTruthy();
      expect(result.results).toEqual([]);
    }, 60000);
    it('reports UTF-8, runtime errors and output overflow independently per case', async () => {
      const code =
        language === 'java'
          ? 'public class Main { public static void main(String[] args) throws Exception { int c = System.in.read(); if (c == 49) throw new RuntimeException("boom"); if (c == 50) { while(true) System.out.print("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"); } System.out.println("你好"); } }'
          : 'fun main() { val c = System.`in`.read(); if(c == 49) error("boom"); if(c == 50) { while(true) print("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx") }; println("你好") }';
      const store = await workspace(code);
      const result = await new JvmRunner(language).run(
        store.sourcePath('A', language),
        [
          { id: 'utf8', input: '0', expected: '你好' },
          { id: 'runtime', input: '1' },
          { id: 'overflow', input: '2' },
        ],
        { ...config, timeoutMs: 10000 },
        new AbortController().signal,
      );
      expect(result.results.map((r) => r.verdict)).toEqual(['AC', 'RE', 'OLE']);
      expect(result.results[1].stderr).toContain('boom');
      expect(Buffer.byteLength(result.results[2].stdout)).toBeLessThanOrEqual(1_000_000);
    }, 60000);
    it('enforces runtime timeout and supports cancellation', async () => {
      const store = await workspace(
        language === 'java'
          ? 'public class Main { public static void main(String[] args) { while(true) {} } }'
          : 'fun main() { while(true) {} }',
      );
      const result = await new JvmRunner(language).run(
        store.sourcePath('A', language),
        [{ id: 'x', input: '' }],
        { ...config, timeoutMs: 500 },
        new AbortController().signal,
      );
      expect(result.results[0]?.verdict).toBe('TLE');
      const abort = new AbortController();
      abort.abort();
      const cancelled = await new JvmRunner(language).run(
        store.sourcePath('A', language),
        [{ id: 'x', input: '' }],
        config,
        abort.signal,
      );
      expect(cancelled.cancelled).toBe(true);
    }, 60000);
  });
}
