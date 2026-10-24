import { describe, expect, it } from 'vitest';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CodeforcesClientClient, codeforcesClientExecutable } from '../../src/infrastructure/codeforces/codeforces-client';
import { executeProcess } from '../../src/infrastructure/execution/process-executor';

const executable = codeforcesClientExecutable(path.resolve('.'));
describe.skipIf(!existsSync(executable))('real embedded Codeforces Client (offline)', () => {
  it('starts without Go on PATH, checks capabilities, and leaves user/bundle state untouched', async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'codeforces-client-offline-'));
    const original = { ...process.env };
    try {
      for (const [args, exit] of [
        [['capabilities'], 0],
        [['submit'], 2],
        [['session', 'check'], 2],
      ] as const) {
        const result = await executeProcess(executable, [...args, '--request-id', 'offline-test'], {
          cwd: folder,
          timeoutMs: 15000,
          signal: new AbortController().signal,
          env: {
            ...process.env,
            PATH: '',
            HOME: folder,
            USERPROFILE: folder,
            XDG_CONFIG_HOME: folder,
            GOPATH: path.join(folder, 'missing'),
          },
        });
        expect(result.code, result.stderr).toBe(exit);
        expect(JSON.parse(result.stdout)).toMatchObject({
          protocol: 1,
          requestId: 'offline-test',
          type: 'result',
          ok: exit === 0,
        });
      }
      const bridge = new CodeforcesClientClient(executable);
      try {
        await expect(bridge.ready()).resolves.toBeUndefined();
      } finally {
        bridge.dispose();
      }
      expect(await fs.readdir(folder)).toEqual([]);
      expect(process.env).toEqual(original);
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  }, 30000);
});
