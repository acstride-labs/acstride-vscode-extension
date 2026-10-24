import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { CfToolClient, cfToolExecutable } from '../../src/infrastructure/codeforces/cf-tool-client';

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
              data: capabilities ? { protocol: 1, anonymous: ['api'] } : [{ id: 1 }],
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

describe('bundled CF Tool bridge', () => {
  it('uses protocol/request IDs, one handshake, explicit args and no auth operations', async () => {
    const run = fake(),
      client = new CfToolClient('/bundle/acstride-cf', run);
    await expect(client.call('contest.list', { gym: 'false' })).resolves.toEqual([{ id: 1 }]);
    await client.call('contest.status', { contestId: 1, handle: 'tester', from: 1, count: 100 });
    await client.call('contest.standings', { contestId: 1 });
    expect(run.mock.calls.filter((c) => c[1][0] === 'capabilities')).toHaveLength(1);
    expect(run.mock.calls.at(-1)![1]).toContain('--all-rows');
    expect(JSON.stringify(run.mock.calls)).not.toMatch(/session-stdin|experimental|credentials/);
    client.dispose();
  });
  it.each(['wrong-id', 'version', 'invalid', 'failure'])('rejects %s responses', async (mode) => {
    const client = new CfToolClient('/bundle/acstride-cf', fake(mode));
    await expect(client.call('contest.list', { gym: 'false' })).rejects.toThrow();
  });
  it('does not expose server error bodies', async () => {
    const client = new CfToolClient('/bundle/acstride-cf', fake('failure'));
    await expect(client.call('contest.list', { gym: 'false' })).rejects.not.toThrow(
      'PRIVATE RAW BODY',
    );
  });
  it('rejects unsupported methods and argument injection before execution', async () => {
    const run = fake(),
      client = new CfToolClient('/bundle/acstride-cf', run);
    for (const [method, params] of [
      ['enter', {}],
      ['contest.list', { gym: 'true' }],
      ['contest.status', { contestId: 1, handle: 'tester; --experimental' }],
      ['contest.status', { contestId: 1, count: 101 }],
      ['contest.standings', { contestId: '../1' }],
    ] as const)
      await expect(client.call(method, params)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
  it('chooses only the extension-owned platform executable', () => {
    expect(
      cfToolExecutable('/extension', 'win32').endsWith(
        path.join('resources', 'cf-tool', 'acstride-cf.exe'),
      ),
    ).toBe(true);
  });
});
