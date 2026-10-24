import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
const eventSchema = z.object({
  protocol: z.literal(1),
  requestId: z.string(),
  type: z.string(),
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional(),
});
export type ReadEvent = z.infer<typeof eventSchema>;
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  chain: Promise<void>;
  event?: (event: ReadEvent) => Promise<void>;
};
export class ReadSession {
  private child?: ChildProcessWithoutNullStreams;
  private pending = new Map<string, Pending>();
  private stopped = false;
  constructor(
    private executable: string,
    private args = ['serve', '--bundled', '--json', '--non-interactive'],
    private formatError: (code: string) => string = (code: string) =>
      code === 'cancelled'
        ? 'Codeforces connection closed.'
        : code === 'timeout'
          ? 'Codeforces read request timed out. Cached data is retained.'
          : code === 'protocol_mismatch'
            ? 'Codeforces read protocol mismatch.'
            : 'Codeforces read process disconnected. Cached data is retained.',
  ) {}
  private failure(code: string) {
    return Object.assign(new Error(this.formatError(code)), { code });
  }
  private start() {
    if (this.stopped) throw this.failure('cancelled');
    if (this.child) return this.child;
    const child = spawn(this.executable, this.args, {
      cwd: path.dirname(this.executable),
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stderr.resume();
    child.stdin.on('error', () => this.fail(child, this.failure('tool_unavailable')));
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      let event: ReadEvent;
      try {
        event = eventSchema.parse(JSON.parse(line));
      } catch {
        this.fail(child, this.failure('protocol_mismatch'));
        return;
      }
      const pending = this.pending.get(event.requestId);
      if (!pending) return;
      if (event.type === 'result') {
        clearTimeout(pending.timer);
        this.pending.delete(event.requestId);
        void pending.chain
          .then(() => {
            if (!event.ok) {
              const error = this.failure(event.error?.code || 'request_failed');
              pending.reject(error);
            } else pending.resolve(event.data);
          })
          .catch(pending.reject);
      } else {
        pending.chain = pending.chain.then(() => pending.event?.(event));
        // Keep the rejected chain observable until its final result or disconnect.
        void pending.chain.catch(() => {});
      }
    });
    child.on('error', () => this.fail(child, this.failure('tool_unavailable')));
    child.on('close', () => {
      lines.close();
      this.fail(child, this.failure('tool_unavailable'));
    });
    return child;
  }
  request(command: Record<string, unknown>, event?: Pending['event']): Promise<unknown> {
    const child = this.start();
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(child, this.failure('timeout')),
        command.command === 'download' ? 610000 : 30000,
      );
      this.pending.set(requestId, { resolve, reject, timer, chain: Promise.resolve(), event });
      child.stdin.write(JSON.stringify({ ...command, requestId }) + '\n', (error) => {
        if (error) this.fail(child, this.failure('tool_unavailable'));
      });
    });
  }
  private fail(child: ChildProcessWithoutNullStreams, error: Error) {
    if (this.child !== child) return;
    this.child = undefined;
    // EOF lets the Go session cancel requests and reap its persistent transport workers.
    child.stdin.end();
    const force = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          windowsHide: true,
        });
        killer.on('error', () => child.kill());
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    }, 2000);
    force.unref();
    child.once('close', () => clearTimeout(force));
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      void request.chain.finally(() => request.reject(error)).catch(() => {});
    }
    this.pending.clear();
  }
  dispose() {
    this.stopped = true;
    if (this.child) this.fail(this.child, this.failure('cancelled'));
  }
}
