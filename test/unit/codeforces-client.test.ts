import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { CodeforcesClientClient, codeforcesClientExecutable } from '../../src/infrastructure/codeforces/codeforces-client';

function fake(mode = 'success') {
  return vi.fn(async (_exe: string, args: string[]) => {
    const requestId = args[args.indexOf('--request-id') + 1];
    const capabilities = args[0] === 'capabilities';
    return {
      code: mode === 'failure' ? 4 : 0,
      stdout:
        mode === 'invalid'
          ? '{}'
          : JSON.stringify({
              protocol: mode === 'version' ? 99 : 1,
              requestId: mode === 'wrong-id' ? 'another-request' : requestId,
              type: 'result',
              ok: mode !== 'failure',
              data: capabilities
                ? { protocol: 1, anonymous: ['api', 'problem.read'] }
                : [{ id: 1 }],
              ...(mode === 'failure'
                ? {
                    error: {
                      code: 'verification_required',
                      message: 'PRIVATE RAW BODY',
                      retryable: false,
                    },
                  }
                : {}),
            }),
      stderr: '',
      reason: undefined,
      durationMs: 1,
    };
  });
}

describe('bundled Codeforces Client bridge', () => {
  it('uses protocol/request IDs, one handshake, explicit args and no auth operations', async () => {
    const run = fake(),
      client = new CodeforcesClientClient('/bundle/codeforces-client', run);
    await expect(client.call('contest.list', { gym: 'false' })).resolves.toEqual([{ id: 1 }]);
    await client.call('contest.status', { contestId: 1, handle: 'tester', from: 1, count: 100 });
    await client.call('contest.standings', { contestId: 1 });
    expect(run.mock.calls.filter((c) => c[1][0] === 'capabilities')).toHaveLength(1);
    expect(run.mock.calls.at(-1)![1]).toContain('--all-rows');
    expect(JSON.stringify(run.mock.calls)).not.toMatch(/session-stdin|experimental|credentials/);
    client.dispose();
  });
  it.each(['wrong-id', 'version', 'invalid', 'failure'])('rejects %s responses', async (mode) => {
    const client = new CodeforcesClientClient('/bundle/codeforces-client', fake(mode));
    await expect(client.call('contest.list', { gym: 'false' })).rejects.toThrow();
  });
  it('does not expose server error bodies', async () => {
    const client = new CodeforcesClientClient('/bundle/codeforces-client', fake('failure'));
    await expect(client.call('contest.list', { gym: 'false' })).rejects.not.toThrow(
      'PRIVATE RAW BODY',
    );
  });
  it('rejects unsupported methods and argument injection before execution', async () => {
    const run = fake(),
      client = new CodeforcesClientClient('/bundle/codeforces-client', run);
    for (const [method, params] of [
      ['enter', {}],
      ['contest.list', { gym: 'true' }],
      ['contest.status', { contestId: 1, handle: 'tester; --experimental' }],
      ['contest.status', { contestId: 1, count: 0 }],
      ['contest.standings', { contestId: '../1' }],
    ] as const)
      await expect(client.call(method, params)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
  it('chooses only the extension-owned platform executable', () => {
    expect(
      codeforcesClientExecutable('/extension', 'win32').endsWith(
        path.join('resources', 'codeforces-client', 'codeforces-client.exe'),
      ),
    ).toBe(true);
  });
});

it('accepts only matching structured problem identities and declared local assets', async () => {
  const asset = 'a'.repeat(64) + '.png';
  const run = fake();
  const transport = vi.fn(async (exe: string, args: string[]) => {
    const base = await run(exe, args);
    if (args[0] === 'capabilities') return base;
    const requestId = args[args.indexOf('--request-id') + 1];
    return {
      ...base,
      stdout: JSON.stringify({
        protocol: 1,
        requestId,
        type: 'result',
        ok: true,
        data: {
          contestId: 1,
          index: 'A',
          name: 'A. Sum',
          url: 'https://codeforces.com/contest/1/problem/A',
          statementHtml: `<p>$$$a+b$$$</p><script>bad()</script><img src="acstride-asset:${asset}" onerror="bad()"><img src="acstride-asset:../x"><img src="https://codeforces.com/image">`,
          timeLimit: '2 seconds',
          memoryLimit: '256 MB',
          fetchedAt: new Date().toISOString(),
          imageFailures: 1,
          assets: [
            asset,
            ...Array.from({ length: 60 }, (_, i) => i.toString(16).padStart(64, '0') + '.png'),
          ],
          samples: [{ input: '你好\n\n', output: '\n' }],
        },
      }),
    };
  });
  const client = new CodeforcesClientClient('/bundle/codeforces-client', transport);
  const result = await client.problem(1, 'A', path.resolve('/assets'));
  expect(result.samples).toEqual([{ id: 'sample-1', input: '你好\n\n', expected: '\n' }]);
  expect(result.statement.html).toContain(`codeforces-workbench-asset:${asset}`);
  expect(result.statement.html).toContain('$$$a+b$$$');
  expect(result.statement.html).not.toMatch(
    /<script|onerror|\.\.\/x|https:\/\/codeforces.com\/image/,
  );
  expect(transport.mock.calls.at(-1)![1]).toContain('--bundled');
  expect(transport.mock.calls.at(-1)![1]).not.toContain('--public-helper');
  await expect(client.problem(0, 'A', '/assets')).rejects.toThrow();
  await expect(client.problem(1, '../A', '/assets')).rejects.toThrow();
  client.dispose();
});

it('sends passwords only on stdin and preserves unknown receipts for exact-ID reconciliation', async () => {
  const receipt = {
    protocol: 1,
    id: 'a'.repeat(32),
    state: 'unknown',
    handle: 'tester',
    contestId: 1,
    index: 'A',
    languageId: '31',
    language: 'Python 3',
    sha256: 'b'.repeat(64),
    createdAt: new Date().toISOString(),
  };
  const run = vi.fn(async (_exe: string, args: string[], _options: { input?: string }) => {
    const submitting = args[0] === 'submit';
    return {
      code: submitting ? 5 : 0,
      durationMs: 1,
      stderr: '',
      stdout: JSON.stringify({
        protocol: 1,
        requestId: args[args.indexOf('--request-id') + 1],
        type: 'result',
        ok: !submitting,
        data: submitting ? receipt : { handle: 'tester', stored: true },
        ...(submitting
          ? {
              error: {
                code: 'submission_unknown',
                message: 'PRIVATE SERVER BODY',
                retryable: false,
              },
            }
          : {}),
      }),
    };
  });
  const client = new CodeforcesClientClient('/bundle/codeforces-client', run);
  await client.login('tester', 'private-password');
  expect(JSON.stringify(run.mock.calls[0][1])).not.toContain('private-password');
  expect(JSON.parse(run.mock.calls[0][2].input!)).toEqual({
    username: 'tester',
    password: 'private-password',
  });
  await expect(
    client.submit(1, 'A', '/work/main.py', '31', 'b'.repeat(64), 'tester'),
  ).resolves.toEqual(receipt);
  expect(run.mock.calls.at(-1)![1]).toEqual(
    expect.arrayContaining([
      '--expected-handle',
      'tester',
      '--expected-sha256',
      'b'.repeat(64),
      '--confirm',
    ]),
  );
  client.dispose();
});
