import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { executeProcess } from '../../src/infrastructure/execution/process-executor';
import { downloaderEnvironment, downloaderExecutable } from '../fixtures/downloader';

const executable = downloaderExecutable(path.resolve('.'));
describe.skipIf(!existsSync(executable))(
  'real bundled downloader (offline, no system Python)',
  () => {
    it('runs with an empty PATH and poisoned Python variables, without writing to its bundle or user environment', async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codeforces-workbench-embedded-'));
      const original = { ...process.env };
      try {
        const result = await executeProcess(executable, ['--self-test'], {
          cwd: root,
          timeoutMs: 20000,
          signal: new AbortController().signal,
          env: {
            ...downloaderEnvironment(),
            PATH: '',
            HOME: root,
            USERPROFILE: root,
            PYTHONHOME: path.join(root, 'nonexistent'),
            PYTHONPATH: path.join(root, 'nonexistent'),
            PYINSTALLER_RESET_ENVIRONMENT: '1',
          },
        });
        expect(result.code, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({
          protocol: 1,
          ready: true,
          embedded: true,
          caBundle: true,
          curlCffi: '0.16.3',
        });
        expect(await fs.readdir(root)).toEqual([]);
        expect(process.env).toEqual(original);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    }, 30000);
    it('uses the real embedded transport and rejects unsupported paths/arguments before any network request', async () => {
      {
        const options = {
          cwd: path.dirname(executable),
          timeoutMs: 20000,
          signal: new AbortController().signal,
          env: { ...downloaderEnvironment(), PATH: '' },
        };
        const result = await executeProcess(executable, [], {
          ...options,
          input: JSON.stringify({ path: '/enter' }),
        });
        expect(JSON.parse(result.stdout)).toEqual({ error: 'invalid_problem_path' });
        const args = await executeProcess(executable, ['--install'], options);
        expect(JSON.parse(args.stdout)).toEqual({ error: 'invalid_arguments' });
      }
    }, 30000);
  },
);
