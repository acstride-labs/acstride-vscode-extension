import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sanitizeStatement } from './statement-sanitizer';
import type { Statement } from '../../domain/contest';
import type { TestCase } from '../../domain/models';
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

  private async run(args: string[], problem = false) {
    const requestId = randomUUID();
    const result = await this.executor(
      this.executable,
      [
        ...args,
        '--json',
        '--non-interactive',
        '--request-id',
        requestId,
        '--timeout',
        problem ? '210s' : '25s',
      ],
      {
        cwd: path.dirname(this.executable),
        timeoutMs: problem ? 220000 : 30000,
        outputLimit: Number.POSITIVE_INFINITY,
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
      if (!caps.success || !['api', 'problem.read'].every((op) => caps.data.anonymous.includes(op)))
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
      (!Number.isSafeInteger(params.count) || Number(params.count) < 1)
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

  async problem(
    id: number,
    index: string,
    assetsDir: string,
  ): Promise<{ statement: Statement; samples: TestCase[] }> {
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      id > 999999999 ||
      !/^[A-Z][0-9]{0,2}$/.test(index) ||
      !path.isAbsolute(assetsDir)
    )
      throw new Error('Invalid Codeforces problem request.');
    await this.ready();
    const value = z
      .object({
        contestId: z.literal(id),
        index: z.literal(index),
        name: z.string(),
        url: z.literal(`https://codeforces.com/contest/${id}/problem/${index}`),
        statementHtml: z.string(),
        timeLimit: z.string(),
        memoryLimit: z.string(),
        fetchedAt: z.string().datetime(),
        imageFailures: z.number().int().nonnegative(),
        assets: z.array(z.string().regex(/^[a-f0-9]{64}\.(png|jpg|gif|webp)$/)),
        samples: z.array(z.object({ input: z.string(), output: z.string() })),
      })
      .parse(
        await this.run(
          ['problem', 'read', String(id), index, '--bundled', '--assets-dir', assetsDir],
          true,
        ),
      );
    return {
      statement: {
        title: value.name,
        html: sanitizeStatement(value.statementHtml, value.assets),
        timeLimit: value.timeLimit,
        memoryLimit: value.memoryLimit,
        fetchedAt: Date.parse(value.fetchedAt),
        imageWarning: value.imageFailures
          ? `${value.imageFailures} image(s) could not be cached and are unavailable offline.`
          : undefined,
      },
      samples: value.samples.map((sample, i) => ({
        id: `sample-${i + 1}`,
        input: sample.input,
        expected: sample.output,
      })),
    };
  }

  dispose() {
    this.abort.abort();
  }
}
