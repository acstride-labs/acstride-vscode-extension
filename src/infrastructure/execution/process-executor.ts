import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
export interface ProcessResult {
  stdout: string;
  stderr: string;
  durationMs: number;
  code: number | null;
  reason?: 'timeout' | 'output' | 'cancelled';
}
export function executeProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    input?: string;
    timeoutMs: number;
    signal: AbortSignal;
    outputLimit?: number;
  },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      resolve({ stdout: '', stderr: '', durationMs: 0, code: null, reason: 'cancelled' });
      return;
    }
    const start = performance.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      size = 0;
    let reason: ProcessResult['reason'];
    const kill = (why: NonNullable<ProcessResult['reason']>) => {
      reason ??= why;
      if (!child.pid) return;
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
    };
    const abort = () => kill('cancelled');
    const timer = setTimeout(() => kill('timeout'), options.timeoutMs);
    options.signal.addEventListener('abort', abort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', abort);
    };
    const collect = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
      const remaining = Math.max(0, (options.outputLimit ?? 1_000_000) - size);
      const text = chunk.subarray(0, remaining).toString('utf8');
      size += chunk.length;
      if (stream === 'stdout') stdout += text;
      else stderr += text;
      if (size > (options.outputLimit ?? 1_000_000)) kill('output');
    };
    child.stdout.on('data', (c) => collect(c, 'stdout'));
    child.stderr.on('data', (c) => collect(c, 'stderr'));
    child.stdin.on('error', () => {
      /* A program may exit without reading all input. */
    });
    child.on('error', (e) => {
      cleanup();
      reject(new Error(`Cannot start ${command}: ${e.message}`));
    });
    child.on('close', (code) => {
      cleanup();
      resolve({ stdout, stderr, code, reason, durationMs: Math.round(performance.now() - start) });
    });
    child.stdin.end(options.input ?? '');
    if (options.signal.aborted) abort();
  });
}
