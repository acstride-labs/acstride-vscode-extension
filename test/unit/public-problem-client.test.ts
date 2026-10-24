import { describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  PublicProblemClient,
  downloaderExecutable,
  downloaderEnvironment,
} from '../../src/infrastructure/codeforces/public-problem-client';
import { RequestQueue } from '../../src/infrastructure/codeforces/request-queue';
import { executeProcess } from '../../src/infrastructure/execution/process-executor';
import { contestRequestSchema } from '../../src/shared/contest-protocol';
import { requestSchema } from '../../src/shared/protocol';
import { statementHtml } from '../fixtures/codeforces';

const successful = (data: unknown) => ({
  code: 0,
  stdout: JSON.stringify(data),
  stderr: '',
  durationMs: 1,
});
function fixture() {
  const queue = new RequestQueue(0),
    executor = vi.fn<typeof executeProcess>();
  const executable = downloaderExecutable(path.resolve('/extension'));
  const client = new PublicProblemClient(queue, executable, executor);
  return {
    queue,
    executor,
    client,
    executable,
    dispose() {
      client.dispose();
      queue.dispose();
    },
  };
}
describe('built-in anonymous public downloads', () => {
  it('uses only the bundled absolute executable and passes public paths over stdin, never a shell/Python/pip', async () => {
    const f = fixture();
    try {
      f.executor.mockResolvedValue(
        successful({
          status: 200,
          url: 'https://codeforces.com/contest/1/problem/A',
          html: statementHtml(),
        }),
      );
      expect((await f.client.page('/contest/1/problem/A')).html).toContain('problem-statement');
      const [command, args, options] = f.executor.mock.calls[0];
      expect(command).toBe(f.executable);
      expect(path.isAbsolute(command)).toBe(true);
      expect(args).toEqual([]);
      expect(JSON.parse(options.input!)).toEqual({ path: '/contest/1/problem/A' });
      expect(options.cwd).toBe(path.dirname(f.executable));
      for (const pathname of [
        '/enter',
        '/contest/1/submit',
        '//evil.test',
        '/contest/1/problem/../../enter',
      ])
        await expect(f.client.page(pathname)).rejects.toThrow('Only public');
      expect(f.executor).toHaveBeenCalledTimes(1);
    } finally {
      f.dispose();
    }
  });
  it('checks the embedded runtime/protocol offline and never attempts to install missing dependencies', async () => {
    const f = fixture();
    try {
      f.executor.mockResolvedValueOnce(successful({ protocol: 1, embedded: true, ready: true }));
      expect(await f.client.ready()).toBe(true);
      expect(f.executor.mock.calls[0][1]).toEqual(['--self-test']);
      f.executor.mockResolvedValueOnce(successful({ protocol: 1, embedded: false, ready: true }));
      expect(await f.client.ready()).toBe(false);
      f.executor.mockRejectedValue(new Error('ENOENT'));
      expect(await f.client.ready()).toBe(false);
      await expect(f.client.page('/contest/1/problem/A')).rejects.toThrow(
        'Reinstall the AC-Stride VSIX',
      );
      expect(f.executor.mock.calls.every(([command]) => command === f.executable)).toBe(true);
    } finally {
      f.dispose();
    }
  });
  it('isolates child Python/native-library settings without changing any parent environment or PATH', () => {
    const source = {
      PATH: 'original',
      PYTHONHOME: 'bad',
      PYTHONPATH: 'bad',
      IMPERSONATE_CONFIG_DIR: 'bad',
      IMPERSONATE_API_KEY: 'bad',
      VIRTUAL_ENV: 'bad',
      CONDA_PREFIX: 'bad',
      LD_LIBRARY_PATH: 'bad',
      DYLD_LIBRARY_PATH: 'bad',
      _PYI_APPLICATION_HOME_DIR: 'bad',
      SSL_CERT_FILE: 'bad',
      HTTPS_PROXY: 'http://proxy:8080',
      SystemRoot: 'windows',
    };
    expect(downloaderEnvironment(source)).toEqual({
      PATH: 'original',
      HTTPS_PROXY: 'http://proxy:8080',
      SystemRoot: 'windows',
    });
    expect(source.PYTHONHOME).toBe('bad');
    expect(process.env).not.toBe(source);
    expect(downloaderExecutable('/extension', 'win32')).toContain('cfide-downloader.exe');
  });
  it('reports blocking and malformed responses without sending users to removed setup/login controls', async () => {
    const f = fixture();
    try {
      f.executor.mockResolvedValueOnce(
        successful({
          status: 403,
          url: 'https://codeforces.com/contest/1/problem/A',
          html: '<title>Just a moment</title>',
        }),
      );
      await expect(f.client.page('/contest/1/problem/A')).rejects.toThrow(
        'blocked this anonymous download',
      );
      f.executor.mockResolvedValueOnce(successful({ error: 'missing_dependency' }));
      await expect(f.client.page('/contest/1/problem/A')).rejects.toThrow(
        'Reinstall the AC-Stride VSIX',
      );
      f.executor.mockResolvedValueOnce(
        successful({ status: 200, url: 'https://evil.test/', html: statementHtml() }),
      );
      await expect(f.client.page('/contest/1/problem/A')).rejects.toThrow('unexpected');
      f.executor.mockResolvedValueOnce(
        successful({
          status: 200,
          url: 'https://codeforces.com/contest/2/problem/A',
          html: statementHtml(),
        }),
      );
      await expect(f.client.page('/contest/1/problem/A')).rejects.toThrow('unexpected');
      f.executor.mockResolvedValueOnce({ code: 0, stdout: 'bad json', stderr: '', durationMs: 1 });
      await expect(f.client.page('/contest/1/problem/A')).rejects.toThrow('Reinstall');
      f.executor.mockResolvedValueOnce(successful({ error: 'request_failed' }));
      await expect(f.client.page('/contest/1/problem/A')).rejects.toThrow('request_failed');
    } finally {
      f.dispose();
    }
  });
  it('distinguishes timeout/cancellation and aborts running processes on disposal', async () => {
    const f = fixture();
    try {
      f.executor.mockResolvedValueOnce({
        code: null,
        stdout: '',
        stderr: '',
        durationMs: 1,
        reason: 'timeout',
      });
      await expect(f.client.page('/contest/1/problem/A')).rejects.toThrow('timed out');
      f.executor.mockResolvedValueOnce({
        code: null,
        stdout: '',
        stderr: '',
        durationMs: 1,
        reason: 'cancelled',
      });
      await expect(f.client.page('/contest/1/problem/A')).rejects.toThrow('cancelled');
      const signal = f.executor.mock.calls[0][2].signal;
      f.client.dispose();
      expect(signal.aborted).toBe(true);
    } finally {
      f.dispose();
    }
  });
  it('removes setup/settings as well as account actions from the manifest and validated UI protocols', async () => {
    for (const type of [
      'setupDownloads',
      'login',
      'logout',
      'connectBrowser',
      'connectCookie',
      'registration',
      'announcements',
      'resolveAttempt',
      'viewSnapshot',
    ])
      expect(contestRequestSchema.safeParse({ type, contestId: 1 }).success).toBe(false);
    expect(requestSchema.safeParse({ type: 'submit' }).success).toBe(false);
    expect(
      requestSchema.safeParse({
        type: 'copySource',
        target: { id: 'A', language: 'cpp', contestId: 1 },
      }).success,
    ).toBe(true);
    expect(requestSchema.safeParse({ type: 'copySource' }).success).toBe(false);
    const manifest = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));
    const commands = manifest.contributes.commands.map((c: { command: string }) => c.command);
    for (const command of [
      'cfide.setupPublicDownloads',
      'cfide.signIn',
      'cfide.signOut',
      'cfide.submitSolution',
      'cfide.connectBrowser',
      'cfide.connectCookie',
    ])
      expect(commands).not.toContain(command);
    expect(
      manifest.contributes.configuration.properties['cfide.codeforces.setupPython'],
    ).toBeUndefined();
    expect(
      manifest.contributes.configuration.properties['cfide.codeforces.downloadPython'],
    ).toBeUndefined();
    expect(manifest.dependencies.ws).toBeUndefined();
    expect(manifest.dependencies['tough-cookie']).toBeUndefined();
  });
});
