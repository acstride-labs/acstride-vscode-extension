import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BrowserSession,
  browserLaunchSpec,
  codeforcesUrl,
} from '../../src/infrastructure/codeforces/browser-session';
import { CdpClient } from '../../src/infrastructure/codeforces/cdp-client';
import { signedIn, statementHtml } from '../fixtures/codeforces';

vi.mock('../../src/infrastructure/codeforces/cdp-client', () => ({
  CdpClient: { connect: vi.fn() },
}));
const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(
    folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })),
  );
});
async function fixture() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-browser-unit-'));
  folders.push(profile);
  await fs.writeFile(
    path.join(profile, 'DevToolsActivePort'),
    '12345\n/devtools/browser/fixture-browser\n',
  );
  const endpoint = 'ws://127.0.0.1:12345/devtools/browser/fixture-browser';
  const fetcher = vi.fn(async () => Response.json({ webSocketDebuggerUrl: endpoint }));
  vi.stubGlobal('fetch', fetcher);
  let url = 'about:blank';
  let html = signedIn;
  const client = {
    onEvent: vi.fn(),
    connected: true,
    close: vi.fn(),
    send: vi.fn(async (method: string, params: Record<string, any> = {}): Promise<any> => {
      if (method === 'Target.createTarget') return { targetId: 'operations' };
      if (method === 'Target.attachToTarget') return { sessionId: 'session' };
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main-frame' } } };
      if (method === 'Page.navigate') {
        url = params.url;
        return {};
      }
      if (method === 'Runtime.evaluate') {
        const expression = String(params.expression);
        if (expression.includes('const f=document.createElement')) {
          url = JSON.parse(/f.action=("[^"]+")/.exec(expression)![1]);
          return { result: { value: true } };
        }
        return { result: { value: { html, url, ready: 'complete' } } };
      }
      return {};
    }),
  };
  client.onEvent.mockReturnValue(vi.fn());
  vi.mocked(CdpClient.connect).mockResolvedValue(client as unknown as CdpClient);
  const browser = new BrowserSession(profile, () => undefined);
  return {
    browser,
    client,
    fetcher,
    setHtml: (value: string) => {
      html = value;
    },
    endpoint,
  };
}
describe('dedicated browser boundaries', () => {
  it('launches a separate profile with loopback debugging and no automation/sandbox-disabling flags', () => {
    const mac = browserLaunchSpec(
      'darwin',
      '/Applications/Google Chrome.app',
      '/private/tmp/cfide profile',
    );
    expect(mac.command).toBe('/usr/bin/open');
    expect(mac.args).toContain('--user-data-dir=/private/tmp/cfide profile');
    expect(mac.args).toContain('--remote-debugging-address=127.0.0.1');
    expect(mac.args).toContain('--remote-debugging-port=0');
    expect(mac.args.join(' ')).not.toMatch(
      /--no-sandbox|--enable-automation|--disable-web-security|--disable-blink/,
    );
    expect(browserLaunchSpec('win32', 'C:\\Chrome.exe', 'C:\\cfide').command).toBe(
      'C:\\Chrome.exe',
    );
    for (const value of ['//evil.test', '/\\evil.test', 'https://evil.test'])
      expect(() => codeforcesUrl(value)).toThrow();
    expect(codeforcesUrl('/contest/1/problem/A')).toBe(
      'https://codeforces.com/contest/1/problem/A',
    );
  });
  it('connects only to the endpoint belonging to its dedicated profile and uses a separate operations tab', async () => {
    const { browser, client, fetcher, endpoint, setHtml } = await fixture();
    expect((await browser.connect()).html).toContain('/logout');
    expect(CdpClient.connect).toHaveBeenCalledWith(endpoint);
    expect(client.send).toHaveBeenCalledWith('Target.createTarget', {
      url: 'about:blank',
      background: true,
    });
    const listener = client.onEvent.mock.calls[0][0] as (
      method: string,
      params: unknown,
      session: string,
    ) => void;
    listener(
      'Fetch.requestPaused',
      { requestId: 'blocked', request: { url: 'https://external.test/collect' } },
      'session',
    );
    expect(client.send).toHaveBeenCalledWith(
      'Fetch.failRequest',
      { requestId: 'blocked', errorReason: 'BlockedByClient' },
      'session',
    );
    listener(
      'Fetch.requestPaused',
      { requestId: 'allowed', request: { url: 'https://codeforces.com/contest/1' } },
      'session',
    );
    expect(client.send).toHaveBeenCalledWith(
      'Fetch.continueRequest',
      { requestId: 'allowed' },
      'session',
    );
    listener(
      'Fetch.requestPaused',
      {
        requestId: 'challenge',
        frameId: 'iframe',
        request: { url: 'https://challenges.cloudflare.com/widget', method: 'GET' },
      },
      'session',
    );
    expect(client.send).toHaveBeenCalledWith(
      'Fetch.continueRequest',
      { requestId: 'challenge' },
      'session',
    );
    listener(
      'Fetch.requestPaused',
      {
        requestId: 'do-not-forward-source',
        frameId: 'main-frame',
        request: { url: 'https://challenges.cloudflare.com/collect', method: 'POST' },
      },
      'session',
    );
    expect(client.send).toHaveBeenCalledWith(
      'Fetch.failRequest',
      { requestId: 'do-not-forward-source', errorReason: 'BlockedByClient' },
      'session',
    );
    setHtml(statementHtml());
    expect((await browser.page('/contest/1/problem/A')).html).toContain('problem-statement');
    expect(fetcher).toHaveBeenCalledTimes(1); // Website content comes from Chrome, not Node fetch.
    browser.disconnect();
    expect(client.send).toHaveBeenCalledWith('Target.closeTarget', { targetId: 'operations' });
    await expect(browser.page('/')).rejects.toThrow('not connected');
  });
  it('refuses a mismatched local debugger endpoint', async () => {
    const { browser, fetcher } = await fixture();
    fetcher.mockImplementation(async () =>
      Response.json({ webSocketDebuggerUrl: 'ws://external.test/devtools/browser/other' }),
    );
    await expect(browser.connect()).rejects.toThrow('does not match');
  });
  it('checks account identity before sending a browser form and never retries a write', async () => {
    const { browser, client, setHtml } = await fixture();
    await browser.connect();
    const body = new URLSearchParams({ source: 'print(42)', csrf_token: 'fixture' });
    await expect(browser.page('/contest/1234/submit', body, 'other-account')).rejects.toThrow(
      'No request was sent',
    );
    const writes = () =>
      client.send.mock.calls.filter(
        ([method, params]) =>
          method === 'Runtime.evaluate' &&
          String(params?.expression).includes('const f=document.createElement'),
      );
    expect(writes()).toHaveLength(0);
    await browser.page('/contest/1234/submit', body, 'tester');
    expect(writes()).toHaveLength(1);
    expect(String(writes()[0][1]?.expression)).toContain('print(42)');
    setHtml('<title>Just a moment...</title>');
    await expect(browser.page('/enter')).rejects.toThrow('verification');
    browser.disconnect();
  });
});
