import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { CdpClient } from './cdp-client';
import { loggedHandle, SiteVerificationError } from './session-client';

export interface BrowserConnection {
  readonly connected?: boolean;
  connect(): Promise<{ html: string; url: string }>;
  page(
    pathname: string,
    body?: URLSearchParams,
    expectedHandle?: string,
  ): Promise<{ html: string; url: string }>;
  disconnect(): void;
}
export function browserLaunchSpec(platform: NodeJS.Platform, executable: string, profile: string) {
  const args = [
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'https://codeforces.com/enter',
  ];
  return platform === 'darwin'
    ? { command: '/usr/bin/open', args: ['-n', '-a', executable, '--args', ...args] }
    : { command: executable, args };
}
export function codeforcesUrl(pathname: string) {
  if (!pathname.startsWith('/') || pathname.startsWith('//'))
    throw new Error('Invalid Codeforces path.');
  const url = new URL(pathname, 'https://codeforces.com');
  if (url.origin !== 'https://codeforces.com' || url.username || url.password)
    throw new Error('Only Codeforces pages are allowed.');
  return url.href;
}
export class BrowserSession implements BrowserConnection {
  get connected() {
    return !!this.client?.connected && !!this.sessionId;
  }
  private client?: CdpClient;
  private sessionId?: string;
  private targetId?: string;
  private removeListener?: () => void;
  private generation = 0;
  constructor(
    readonly profile: string,
    private executable: () => string | undefined,
    private platform = process.platform,
  ) {}
  async findExecutable() {
    const configured = this.executable();
    if (configured) {
      await fs.access(configured);
      return configured;
    }
    const candidates =
      this.platform === 'darwin'
        ? ['/Applications/Google Chrome.app', '/Applications/Microsoft Edge.app']
        : this.platform === 'win32'
          ? [
              path.join(
                process.env.PROGRAMFILES || 'C:\\Program Files',
                'Google/Chrome/Application/chrome.exe',
              ),
              path.join(
                process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
                'Microsoft/Edge/Application/msedge.exe',
              ),
              path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
            ]
          : (process.env.PATH || '')
              .split(path.delimiter)
              .flatMap((dir) =>
                ['google-chrome', 'google-chrome-stable', 'microsoft-edge'].map((name) =>
                  path.join(dir, name),
                ),
              );
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        /* Try the next standard install path. */
      }
    }
    throw new Error(
      'Chrome/Edge not found. Configure cfide.codeforces.browserExecutable with an absolute application path.',
    );
  }
  async launch() {
    await fs.mkdir(this.profile, { recursive: true, mode: 0o700 });
    try {
      await this.endpoint();
      return false;
    } catch {
      /* No active dedicated browser. */
    }
    const spec = browserLaunchSpec(this.platform, await this.findExecutable(), this.profile);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(spec.command, spec.args, {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
      child.once('error', reject);
      if (this.platform === 'darwin')
        child.once('exit', (code) =>
          code === 0 ? resolve() : reject(new Error('Could not open the dedicated browser.')),
        );
      else child.once('spawn', resolve);
      child.unref();
    });
    return true;
  }
  private async endpoint() {
    const parts = (await fs.readFile(path.join(this.profile, 'DevToolsActivePort'), 'utf8'))
      .trim()
      .split(/\r?\n/);
    if (
      !/^\d+$/.test(parts[0]) ||
      Number(parts[0]) < 1 ||
      Number(parts[0]) > 65535 ||
      !/^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(parts[1])
    )
      throw new Error('Invalid dedicated browser connection file.');
    const endpoint = `ws://127.0.0.1:${parts[0]}${parts[1]}`;
    const response = await fetch(`http://127.0.0.1:${parts[0]}/json/version`, {
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
    });
    const data = (await response.json()) as { webSocketDebuggerUrl?: string };
    if (!response.ok || data.webSocketDebuggerUrl !== endpoint)
      throw new Error('Dedicated browser connection does not match its profile.');
    return endpoint;
  }
  async connect() {
    this.disconnect();
    try {
      this.client = await CdpClient.connect(await this.endpoint());
      // Never take over the user's login tab. Operations use a separate tab in the dedicated profile.
      const { targetId } = await this.client.send('Target.createTarget', {
        url: 'about:blank',
        background: true,
      });
      this.targetId = targetId;
      this.sessionId = (
        await this.client.send('Target.attachToTarget', { targetId, flatten: true })
      ).sessionId;
      const client = this.client,
        sessionId = this.sessionId;
      await client.send('Page.enable', {}, sessionId);
      const mainFrame = (await client.send('Page.getFrameTree', {}, sessionId)).frameTree.frame
        .id as string;
      this.removeListener = client.onEvent((method, params, eventSession) => {
        if (method !== 'Fetch.requestPaused' || eventSession !== sessionId) return;
        let allowed = false;
        try {
          const origin = new URL(params.request.url).origin;
          allowed =
            origin === 'https://codeforces.com' ||
            (origin === 'https://challenges.cloudflare.com' &&
              !!params.frameId &&
              params.frameId !== mainFrame &&
              params.request.method === 'GET');
        } catch {
          /* Reject malformed navigation URLs. */
        }
        void client
          .send(
            allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest',
            {
              requestId: params.requestId,
              ...(!allowed ? { errorReason: 'BlockedByClient' } : {}),
            },
            sessionId,
          )
          .catch(() => {});
      });
      // Stop cross-origin document redirects before the browser can forward a submitted source.
      await client.send(
        'Fetch.enable',
        { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] },
        sessionId,
      );
      return await this.page('/');
    } catch (error) {
      this.disconnect();
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT')
        throw new Error(
          'Dedicated Chrome is not running yet. Click “1. Open dedicated Chrome”, finish sign-in there, then click “2. Connect after sign-in”.',
        );
      throw new Error(
        `Could not connect to the dedicated Chrome. Open it, finish verification/sign-in, then click Connect. ${error instanceof Error ? error.message : ''}`,
      );
    }
  }
  private async evaluate<T>(expression: string): Promise<T> {
    const response = await this.client!.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      this.sessionId,
    );
    if (response.exceptionDetails)
      throw new Error('The browser could not execute the requested page operation.');
    return response.result?.value as T;
  }
  async page(pathname: string, body?: URLSearchParams, expectedHandle?: string) {
    const url = codeforcesUrl(pathname),
      client = this.client,
      generation = this.generation;
    if (!client || !this.sessionId)
      throw new Error(
        'Dedicated browser is not connected. Open it and click Connect after signing in.',
      );
    const nonce = randomUUID();
    if (body) {
      const current = await this.evaluate<{ html: string; url: string }>(
        '({html:location.origin === "https://codeforces.com" ? document.documentElement.outerHTML : "",url:location.href})',
      );
      if (
        new URL(current.url).origin !== 'https://codeforces.com' ||
        !expectedHandle ||
        loggedHandle(current.html)?.toLowerCase() !== expectedHandle.toLowerCase()
      )
        throw new Error(
          'The browser account changed or expired. No request was sent. Reconnect and verify the account.',
        );
      // A real browser form navigation preserves the browser network/session environment.
      // Delay until the CDP reply is sent; never retry this operation after a transport error.
      await this.evaluate(
        `(() => { globalThis.__cfideNavigation=${JSON.stringify(nonce)}; const f=document.createElement('form'); f.method='POST'; f.action=${JSON.stringify(url)}; for(const [name,value] of ${JSON.stringify([...body])}) {const input=document.createElement('textarea');input.name=name;input.value=value;f.appendChild(input);} f.hidden=true;document.body.appendChild(f);setTimeout(()=>HTMLFormElement.prototype.submit.call(f),0);return true; })()`,
      );
    } else {
      await this.evaluate(`globalThis.__cfideNavigation=${JSON.stringify(nonce)}`);
      const navigation = await client.send('Page.navigate', { url }, this.sessionId);
      if (navigation.errorText)
        throw new Error(`Browser navigation failed: ${navigation.errorText}`);
    }
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      if (generation !== this.generation)
        throw new Error('Browser connection changed. No request was retried.');
      let state;
      try {
        state = await this.evaluate<{ marker?: string; url: string; ready: string; html: string }>(
          '({marker:globalThis.__cfideNavigation,url:location.href,ready:document.readyState,html:location.origin === "https://codeforces.com" ? document.documentElement.outerHTML : ""})',
        );
      } catch (error) {
        if (Date.now() + 500 >= deadline) throw error;
      }
      if (state && state.marker !== nonce && ['interactive', 'complete'].includes(state.ready)) {
        if (new URL(state.url).origin !== 'https://codeforces.com')
          throw new Error('Browser left Codeforces. No external page content was read.');
        if (state.html.length > 10000000)
          throw new Error('Codeforces page exceeds the supported size.');
        if (
          /cf-chl-|<title>\s*Just a moment|id=["']challenge-form|<title>请稍候/i.test(state.html)
        ) {
          await client.send('Target.activateTarget', { targetId: this.targetId }).catch(() => {});
          throw new SiteVerificationError(
            'Codeforces requires site verification. Complete it manually in the dedicated browser tab, then retry downloads/reconnect. If this was a submission, check its uncertain receipt before retrying.',
          );
        }
        return { html: state.html, url: state.url };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(
      'Browser navigation timed out. If this was a submission, check its receipt before retrying.',
    );
  }
  disconnect() {
    this.generation++;
    this.removeListener?.();
    this.removeListener = undefined;
    const client = this.client,
      targetId = this.targetId;
    this.client = undefined;
    this.sessionId = undefined;
    this.targetId = undefined;
    if (client && targetId)
      void client
        .send('Target.closeTarget', { targetId })
        .catch(() => {})
        .finally(() => client.close());
    else client?.close();
  }
}
