import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PublicProblemClient } from '../../src/infrastructure/codeforces/public-problem-client';
import { RequestQueue } from '../../src/infrastructure/codeforces/request-queue';
import { executeProcess } from '../../src/infrastructure/execution/process-executor';
import { contestRequestSchema } from '../../src/shared/contest-protocol';
import { requestSchema } from '../../src/shared/protocol';
import { statementHtml } from '../fixtures/codeforces';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })),
  );
});
const successful = (data: unknown) => ({
  code: 0,
  stdout: JSON.stringify(data),
  stderr: '',
  durationMs: 1,
});
describe('anonymous public downloads', () => {
  it('requests only public problem paths, without cookies, passwords or POST support', async () => {
    const queue = new RequestQueue(0),
      executor = vi.fn<typeof executeProcess>().mockResolvedValue(
        successful({
          status: 200,
          url: 'https://codeforces.com/contest/1/problem/A',
          html: statementHtml(),
        }),
      );
    const client = new PublicProblemClient(
      queue,
      async () => '/isolated/python',
      '/extension/public-fetch.py',
      executor,
    );
    expect((await client.page('/contest/1/problem/A')).html).toContain('problem-statement');
    const [command, args, options] = executor.mock.calls[0];
    expect(command).toBe('/isolated/python');
    expect(args).toEqual(['/extension/public-fetch.py']);
    expect(JSON.parse(options.input!)).toEqual({ path: '/contest/1/problem/A' });
    for (const pathname of [
      '/enter',
      '/contest/1/submit',
      '//evil.test',
      '/contest/1/problem/../../enter',
    ])
      await expect(client.page(pathname)).rejects.toThrow('Only public');
    expect(executor).toHaveBeenCalledTimes(1);
    client.dispose();
    queue.dispose();
  });
  it('reports blocked or invalid helper results without suggesting browser/login setup', async () => {
    const queue = new RequestQueue(0),
      executor = vi.fn<typeof executeProcess>();
    const client = new PublicProblemClient(
      queue,
      async () => '/isolated/python',
      '/extension/public-fetch.py',
      executor,
    );
    executor.mockResolvedValueOnce(
      successful({
        status: 403,
        url: 'https://codeforces.com/contest/1/problem/A',
        html: '<title>Just a moment</title>',
      }),
    );
    await expect(client.page('/contest/1/problem/A')).rejects.toThrow('anonymous download');
    executor.mockResolvedValueOnce(successful({ error: 'missing_dependency' }));
    await expect(client.page('/contest/1/problem/A')).rejects.toThrow('Set Up Public Downloads');
    executor.mockResolvedValueOnce(
      successful({ status: 200, url: 'https://evil.test/', html: statementHtml() }),
    );
    await expect(client.page('/contest/1/problem/A')).rejects.toThrow('external');
    executor.mockResolvedValueOnce({ code: 1, stdout: '', stderr: '', durationMs: 1 });
    await expect(client.page('/contest/1/problem/A')).rejects.toThrow('failed');
    client.dispose();
    queue.dispose();
  });
  it('has a read-only basic GET fallback without account headers', async () => {
    const queue = new RequestQueue(0),
      fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(statementHtml()));
    const client = new PublicProblemClient(
      queue,
      async () => undefined,
      '/extension/public-fetch.py',
      executeProcess,
      fetcher,
    );
    await client.page('/contest/1/problem/A');
    const init = fetcher.mock.calls[0][1];
    expect(init?.method).toBe('GET');
    expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).has('cookie')).toBe(false);
    client.dispose();
    queue.dispose();
  });
  it('installs only into its isolated venv, with an explicitly pinned dependency', async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-setup-unit-'));
    folders.push(folder);
    const queue = new RequestQueue(0),
      executor = vi.fn<typeof executeProcess>().mockResolvedValue(successful({}));
    const client = new PublicProblemClient(
      queue,
      async () => undefined,
      '/extension/public-fetch.py',
      executor,
    );
    const python = await client.setup('python3', folder);
    expect(executor.mock.calls[0].slice(0, 2)).toEqual(['python3', ['-m', 'venv', folder]]);
    expect(executor.mock.calls[1][0]).toBe(python);
    expect(executor.mock.calls[1][1]).toContain('curl_cffi==0.16.3');
    client.dispose();
    queue.dispose();
  });
  it('removes unsupported account actions from both manifest and validated UI protocols', async () => {
    for (const type of [
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
    expect(requestSchema.safeParse({ type: 'copySource' }).success).toBe(true);
    const manifest = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));
    const commands = manifest.contributes.commands.map((c: { command: string }) => c.command);
    for (const command of [
      'cfide.signIn',
      'cfide.signOut',
      'cfide.submitSolution',
      'cfide.connectBrowser',
      'cfide.connectCookie',
    ])
      expect(commands).not.toContain(command);
    expect(manifest.dependencies.ws).toBeUndefined();
    expect(manifest.dependencies['tough-cookie']).toBeUndefined();
  });
});
