import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { executeProcess } from '../execution/process-executor';

const envelope = z.object({
  protocol: z.literal(1),
  requestId: z.string(),
  type: z.literal('result'),
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional(),
});

export function cfToolExecutable(root: string, platform = process.platform) {
  return path.join(
    root,
    'resources',
    'cf-tool',
    platform === 'win32' ? 'acstride-cf.exe' : 'acstride-cf',
  );
}

// Anonymous API bridge only. No session commands, user-selected executable, shell or secrets.
export class CfToolClient {
  private abort = new AbortController();
  private handshake?: Promise<void>;
  constructor(
    private executable: string,
    private executor = executeProcess,
    private formatError = (code: string) =>
      `Codeforces tool failed (${code}). Cached data is retained.`,
  ) {}

  private async run(args: string[]) {
    const requestId = randomUUID();
    const result = await this.executor(
      this.executable,
      [...args, '--json', '--non-interactive', '--request-id', requestId, '--timeout', '25s'],
      {
        cwd: path.dirname(this.executable),
        timeoutMs: 30000,
        outputLimit: 14000000,
        signal: this.abort.signal,
      },
    ).catch(() => {
      throw new Error(this.formatError('tool_unavailable'));
    });
    if (result.reason) throw new Error(this.formatError(result.reason));
    let raw: unknown;
    try {
      raw = JSON.parse(result.stdout);
    } catch {
      throw new Error(this.formatError('protocol_mismatch'));
    }
    const parsed = envelope.safeParse(raw);
    if (!parsed.success || parsed.data.requestId !== requestId)
      throw new Error(this.formatError('protocol_mismatch'));
    const value = parsed.data;
    if (result.code !== 0 || !value.ok || value.error)
      throw new Error(this.formatError(value.error?.code ?? 'request_failed'));
    return value.data;
  }

  ready() {
    return (this.handshake ??= this.run(['capabilities']).then((data) => {
      const caps = z
        .object({ protocol: z.literal(1), anonymous: z.array(z.string()) })
        .safeParse(data);
      if (!caps.success || !caps.data.anonymous.includes('api'))
        throw new Error(this.formatError('protocol_mismatch'));
    }));
  }

  async call(method: string, params: Record<string, string | number>) {
    const allowed: Record<string, string[]> = {
      'contest.list': ['gym'],
      'contest.status': ['contestId', 'handle', 'from', 'count'],
      'contest.standings': ['contestId'],
    };
    if (
      !Object.hasOwn(allowed, method) ||
      Object.keys(params).some((key) => !allowed[method].includes(key))
    )
      throw new Error('Unsupported read-only Codeforces tool request.');
    if (method === 'contest.list' && params.gym !== 'false')
      throw new Error('Only regular contests are supported.');
    if (params.contestId !== undefined && !/^[1-9][0-9]{0,8}$/.test(String(params.contestId)))
      throw new Error('Invalid contest ID.');
    if (params.handle !== undefined && !/^[A-Za-z0-9_.-]{1,24}$/.test(String(params.handle)))
      throw new Error('Invalid Codeforces handle.');
    if (params.from !== undefined && params.from !== 1)
      throw new Error('Only recent submissions are supported.');
    if (
      params.count !== undefined &&
      (!Number.isInteger(params.count) || Number(params.count) < 1 || Number(params.count) > 100)
    )
      throw new Error('Invalid result count.');
    await this.ready();
    const args = ['api', method];
    if (params.contestId !== undefined) args.push('--contest', String(params.contestId));
    if (params.handle !== undefined) args.push('--handle', String(params.handle));
    if (params.count !== undefined) args.push('--count', String(params.count));
    if (method === 'contest.standings') args.push('--all-rows');
    return this.run(args);
  }

  dispose() {
    this.abort.abort();
  }
}
