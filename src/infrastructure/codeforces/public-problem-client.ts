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
const unavailable =
  'The bundled downloader is unavailable or incompatible. Reinstall the CFIDE VSIX for this system/CPU architecture. No Python or pip setup is required. Saved solutions/tests are unchanged; saved problem HTML can still be imported.';

export function downloaderExecutable(extensionRoot: string, platform = process.platform) {
  return path.join(
    extensionRoot,
    'resources',
    'downloader',
    'cfide-downloader',
    platform === 'win32' ? 'cfide-downloader.exe' : 'cfide-downloader',
  );
}

// Only change the child's environment; never mutate the extension host or user PATH.
export function downloaderEnvironment(source = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) =>
        !/^(PYTHON|PYINSTALLER_|_PYI_|IMPERSONATE_|CONDA|VIRTUAL_ENV|LD_|DYLD_)/i.test(key) &&
        !/^(SSL_CERT_FILE|SSL_CERT_DIR|REQUESTS_CA_BUNDLE|CURL_CA_BUNDLE)$/i.test(key),
    ),
  );
}

export class PublicProblemClient implements PublicProblemReader {
  private abort = new AbortController();
  constructor(
    private queue: RequestQueue,
    private executable: string,
    private executor = executeProcess,
  ) {}
  private run(args: string[], input?: string) {
    return this.executor(this.executable, args, {
      cwd: path.dirname(this.executable),
      input,
      timeoutMs: input ? 90000 : 15000,
      signal: this.abort.signal,
      outputLimit: input ? 12000000 : 10000,
      env: { ...downloaderEnvironment(), PYINSTALLER_RESET_ENVIRONMENT: '1' },
    });
  }
  async ready() {
    try {
      const result = await this.run(['--self-test']);
      if (result.code !== 0 || result.reason) return false;
      return z
        .object({ protocol: z.literal(1), ready: z.literal(true), embedded: z.literal(true) })
        .safeParse(JSON.parse(result.stdout)).success;
    } catch {
      return false;
    }
  }
  async page(pathname: string) {
    if (!problemPath.test(pathname))
      throw new Error('Only public Codeforces problem GET requests are supported.');
    return this.queue.schedule(async () => {
      let output;
      try {
        output = await this.run([], JSON.stringify({ path: pathname }));
      } catch {
        throw new Error(unavailable);
      }
      if (output.reason === 'cancelled') throw new Error('Public download cancelled.');
      if (output.code !== 0 || output.reason)
        throw new Error(
          output.reason === 'timeout'
            ? 'Anonymous problem download timed out. Retry later or import saved problem HTML.'
            : unavailable,
        );
      let data: unknown;
      try {
        data = JSON.parse(output.stdout);
      } catch {
        throw new Error(unavailable);
      }
      if (typeof data === 'object' && data && 'error' in data) {
        const code = String(data.error);
        const known = [
          'invalid_problem_path',
          'external_redirect',
          'unexpected_redirect',
          'page_too_large',
          'too_many_redirects',
          'request_failed',
        ];
        throw new Error(
          known.includes(code)
            ? `Anonymous problem download failed (${code}). Retry later or import saved problem HTML. Saved solutions/tests are unchanged.`
            : unavailable,
        );
      }
      const parsed = responseSchema.safeParse(data);
      if (!parsed.success) throw new Error(unavailable);
      const result = parsed.data,
        url = new URL(result.url);
      if (url.origin !== 'https://codeforces.com' || url.pathname !== pathname)
        throw new Error('Rejected an unexpected problem-page redirect.');
      if (
        result.status === 403 ||
        /<title>\s*(Just a moment|请稍候)|id=["']challenge-form/i.test(result.html)
      )
        throw new Error(
          'Codeforces blocked this anonymous download. No browser/login is used. Keep local work and retry later or import a saved public problem HTML file.',
        );
      if (result.status !== 200)
        throw new Error(`Public problem download returned HTTP ${result.status}.`);
      return { html: result.html, url: result.url };
    });
  }
  dispose() {
    this.abort.abort();
  }
}
