import { ReadSession } from './read-session';
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

export function codeforcesClientExecutable(root: string, platform = process.platform) {
  return path.join(
    root,
    'resources',
    'codeforces-client',
    platform === 'win32' ? 'codeforces-client.exe' : 'codeforces-client',
  );
}

export class CodeforcesClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}
const receiptSchema = z.object({
  protocol: z.literal(1),
  id: z.string().regex(/^[a-f0-9]{32}$/),
  state: z.enum(['unknown', 'confirmed', 'abandoned']),
  handle: z.string().regex(/^[A-Za-z0-9_.-]{1,24}$/),
  contestId: z.number().int().positive(),
  index: z.string().regex(/^[A-Z][0-9]{0,2}$/),
  languageId: z.string().regex(/^[0-9]+$/),
  language: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  submissionId: z.number().int().positive().optional(),
});
export type SubmissionReceipt = z.infer<typeof receiptSchema>;

// Typed client operations only. Account commands are invoked explicitly by the host.
export class CodeforcesClientClient {
  private abort = new AbortController();
  private handshake?: Promise<void>;
  private readSession?: ReadSession;
  constructor(
    private executable: string,
    private executor = executeProcess,
    private formatError = (code: string) =>
      `Codeforces tool failed (${code}). Cached data is retained.`,
  ) {
    if (executor === executeProcess)
      this.readSession = new ReadSession(executable, undefined, formatError);
  }

  private async run(args: string[], problem = false, input?: string) {
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
        input,
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
      throw new CodeforcesClientError(
        value.error?.code ?? 'request_failed',
        this.formatError(value.error?.code ?? 'request_failed'),
        value.data,
      );
    return value.data;
  }

  ready() {
    return (this.handshake ??= (
      this.readSession
        ? this.readSession.request({ command: 'capabilities' })
        : this.run(['capabilities'])
    ).then((data) => {
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
      'contest.problems': ['contestId'],
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
    if (this.readSession)
      return this.readSession.request({
        command: method === 'contest.problems' ? 'contest.problems' : 'api',
        method,
        contestId: params.contestId,
        handle: params.handle,
        count: params.count,
      });
    if (method === 'contest.problems')
      return this.run(['contest', 'problems', String(params.contestId)]);
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
    if (this.readSession) {
      let result: Awaited<ReturnType<CodeforcesClientClient['problem']>> | undefined;
      await this.problems(id, [index], assetsDir, {
        problem: async (_index, value) => {
          result = value;
        },
        assets: async (_index, value) => {
          result = value;
        },
        error: async (_index, error) => {
          throw error;
        },
      });
      if (!result) throw new Error(this.formatError('request_failed'));
      return result;
    }
    return this.parseProblem(
      id,
      index,
      await this.run(
        ['problem', 'read', String(id), index, '--bundled', '--assets-dir', assetsDir],
        true,
      ),
    );
  }

  private parseProblem(
    id: number,
    index: string,
    raw: unknown,
    imagesPending = false,
  ): { statement: Statement; samples: TestCase[] } {
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
      .parse(raw);
    return {
      statement: {
        imagesPending: imagesPending && /<img\b/i.test(value.statementHtml),
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

  async problems(
    id: number,
    indices: string[],
    assetsDir: string,
    handlers: {
      problem: (
        index: string,
        value: { statement: Statement; samples: TestCase[] },
      ) => Promise<void>;
      assets: (
        index: string,
        value: { statement: Statement; samples: TestCase[] },
      ) => Promise<void>;
      error: (index: string, error: Error) => Promise<void>;
    },
  ) {
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      id > 999999999 ||
      !indices.length ||
      indices.some((index) => !/^[A-Z][0-9]{0,2}$/.test(index)) ||
      new Set(indices).size !== indices.length ||
      !path.isAbsolute(assetsDir)
    )
      throw new Error('Invalid Codeforces problem request.');
    if (!this.readSession) throw new Error('Streaming read session is unavailable.');
    await this.ready();
    await this.readSession.request(
      { command: 'download', contestId: id, indices, assetsDir },
      async (event) => {
        if (!['problem', 'assets', 'problemError'].includes(event.type))
          throw new Error(this.formatError('protocol_mismatch'));
        const data = z
          .object({
            index: z.string(),
            problem: z.unknown().optional(),
            error: z.object({ code: z.string() }).optional(),
          })
          .parse(event.data);
        if (!indices.includes(data.index)) throw new Error(this.formatError('protocol_mismatch'));
        if (event.type === 'problemError')
          await handlers.error(
            data.index,
            new CodeforcesClientError(
              data.error?.code || 'request_failed',
              this.formatError(data.error?.code || 'request_failed'),
            ),
          );
        else
          await handlers[event.type as 'problem' | 'assets'](
            data.index,
            this.parseProblem(id, data.index, data.problem, event.type === 'problem'),
          );
      },
    );
  }

  async account() {
    return z
      .object({
        handle: z.string().regex(/^[A-Za-z0-9_.-]{1,24}$/),
        authenticated: z.literal(true),
      })
      .parse(await this.run(['session', 'check', '--experimental']));
  }
  async login(username: string, password: string) {
    return z
      .object({ handle: z.string().regex(/^[A-Za-z0-9_.-]{1,24}$/), stored: z.literal(true) })
      .parse(
        await this.run(
          ['session', 'login', '--experimental', '--credentials-stdin', '--store'],
          false,
          JSON.stringify({ username, password }),
        ),
      );
  }
  async forgetSession() {
    await this.run(['session', 'forget']);
  }
  async languages(contestId: number) {
    return z
      .array(z.object({ id: z.string().regex(/^[0-9]+$/), name: z.string() }))
      .parse(
        await this.run(['languages', 'list', '--contest', String(contestId), '--experimental']),
      );
  }
  async submit(
    contestId: number,
    index: string,
    file: string,
    languageId: string,
    hash: string,
    expectedHandle: string,
  ) {
    if (
      !path.isAbsolute(file) ||
      !/^[a-f0-9]{64}$/.test(hash) ||
      !/^[0-9]+$/.test(languageId) ||
      !/^[A-Za-z0-9_.-]{1,24}$/.test(expectedHandle) ||
      !/^[A-Z][0-9]{0,2}$/.test(index) ||
      !Number.isSafeInteger(contestId) ||
      contestId < 1
    )
      throw new Error('Invalid submission request.');
    try {
      return receiptSchema.parse(
        await this.run(
          [
            'submit',
            '--contest',
            String(contestId),
            '--problem',
            index,
            '--file',
            file,
            '--language-id',
            languageId,
            '--expected-sha256',
            hash,
            '--expected-handle',
            expectedHandle,
            '--experimental',
            '--confirm',
          ],
          true,
        ),
      );
    } catch (error) {
      if (error instanceof CodeforcesClientError && error.code === 'submission_unknown')
        return receiptSchema.parse(error.data);
      throw error;
    }
  }
  async reconcile(id: string) {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid submission receipt.');
    try {
      return receiptSchema.parse(
        await this.run(['receipt', 'reconcile', id, '--experimental'], true),
      );
    } catch (error) {
      if (error instanceof CodeforcesClientError && error.code === 'submission_unknown')
        return receiptSchema.parse(error.data);
      throw error;
    }
  }
  async watch(contestId: number, handle: string, submissionId: number) {
    return z
      .object({
        id: z.literal(submissionId),
        contestId: z.literal(contestId),
        problem: z.object({ index: z.string() }),
        creationTimeSeconds: z.number(),
        programmingLanguage: z.string(),
        verdict: z.string(),
        testset: z.string().optional(),
      })
      .parse(
        await this.run([
          'submission',
          'watch',
          '--contest',
          String(contestId),
          '--handle',
          handle,
          '--submission-id',
          String(submissionId),
        ]),
      );
  }

  dispose() {
    this.abort.abort();
    this.readSession?.dispose();
  }
}
