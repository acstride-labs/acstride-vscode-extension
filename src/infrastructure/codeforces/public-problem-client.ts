import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { executeProcess } from '../execution/process-executor';
import { RequestQueue } from './request-queue';

export interface PublicProblemReader {
  page(pathname: string): Promise<{ html: string; url: string }>;
}
const problemPath = /^\/contest\/[1-9][0-9]{0,8}\/problem\/[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const responseSchema = z.object({
  status: z.number().int(),
  url: z.string().url(),
  html: z.string().max(8_000_000),
});
export class PublicProblemClient implements PublicProblemReader {
  private abort = new AbortController();
  constructor(
    private queue: RequestQueue,
    private python: () => Promise<string | undefined>,
    private script: string,
    private executor = executeProcess,
    private fetcher: typeof fetch = fetch,
  ) {}
  async ready() {
    const python = await this.python();
    if (!python) return false;
    try {
      const result = await this.executor(python, ['-B', '-c', 'import curl_cffi'], {
        cwd: path.dirname(this.script),
        timeoutMs: 10000,
        signal: this.abort.signal,
        outputLimit: 10000,
      });
      return result.code === 0 && !result.reason;
    } catch {
      return false;
    }
  }
  async page(pathname: string) {
    if (!problemPath.test(pathname))
      throw new Error('Only public Codeforces problem GET requests are supported.');
    return this.queue.schedule(async () => {
      const python = await this.python();
      let result: { status: number; html: string; url: string };
      if (python) {
        const process = await this.executor(python, [this.script], {
          cwd: path.dirname(this.script),
          input: JSON.stringify({ path: pathname }),
          timeoutMs: 90000,
          signal: this.abort.signal,
          outputLimit: 12000000,
          env: {
            ...globalThis.process.env,
            PYTHONUTF8: '1',
            PYTHONIOENCODING: 'utf-8',
            PYTHONDONTWRITEBYTECODE: '1',
          },
        });
        if (process.code !== 0 || process.reason)
          throw new Error(
            'Public download helper failed or timed out. Re-run “CFIDE: Set Up Public Downloads” or check the configured Python path.',
          );
        let data: unknown;
        try {
          data = JSON.parse(process.stdout);
        } catch {
          throw new Error(
            'Public download helper returned invalid data. Re-run public download setup.',
          );
        }
        if (typeof data === 'object' && data && 'error' in data) {
          const code = String(data.error);
          throw new Error(
            code === 'missing_dependency'
              ? 'curl_cffi is not installed in the selected Python. Run “CFIDE: Set Up Public Downloads”.'
              : `Anonymous problem download failed (${code}). Saved solutions/tests are unchanged.`,
          );
        }
        result = responseSchema.parse(data);
      } else {
        const url = `https://codeforces.com${pathname}`;
        const response = await this.fetcher(url, {
          method: 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Public problem response had no body.');
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.length;
          if (size > 8000000) {
            await reader.cancel();
            throw new Error('Problem page exceeds the supported size.');
          }
          chunks.push(item.value);
        }
        result = { status: response.status, html: Buffer.concat(chunks).toString('utf8'), url };
      }
      if (new URL(result.url).origin !== 'https://codeforces.com')
        throw new Error('Rejected an external problem-page redirect.');
      if (
        result.status === 403 ||
        /<title>\s*(Just a moment|请稍候)|id=["']challenge-form/i.test(result.html)
      )
        throw new Error(
          python
            ? 'Codeforces blocked this anonymous download. No browser/login is used. Keep local work and retry later or import a saved public problem HTML file.'
            : 'Codeforces blocked the basic downloader. Run “CFIDE: Set Up Public Downloads” to enable curl_cffi, or import a saved public problem HTML file.',
        );
      if (result.status !== 200)
        throw new Error(`Public problem download returned HTTP ${result.status}.`);
      return { html: result.html, url: result.url };
    });
  }
  async setup(basePython: string, folder: string) {
    await fs.mkdir(folder, { recursive: true });
    const run = (command: string, args: string[], timeoutMs: number) =>
      this.executor(command, args, {
        cwd: folder,
        timeoutMs,
        signal: this.abort.signal,
        outputLimit: 200000,
      });
    const created = await run(basePython, ['-m', 'venv', folder], 60000);
    if (created.code !== 0 || created.reason)
      throw new Error(
        'Could not create the isolated download environment. Install Python 3.10+ and check cfide.codeforces.setupPython.',
      );
    const python = environmentPython(folder);
    const installed = await run(
      python,
      ['-m', 'pip', 'install', '--disable-pip-version-check', 'curl_cffi==0.16.3'],
      120000,
    );
    if (installed.code !== 0 || installed.reason)
      throw new Error(
        'Public download dependency installation failed. Check the network/Python installation and run setup again.',
      );
    return python;
  }
  dispose() {
    this.abort.abort();
  }
}
export function environmentPython(folder: string) {
  return path.join(folder, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}
