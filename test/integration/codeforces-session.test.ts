import { describe, expect, it, vi } from 'vitest';
import {
  CodeforcesSession,
  SiteVerificationError,
  SubmissionRejectedError,
  formFields,
  submissionReceipt,
} from '../../src/infrastructure/codeforces/session-client';
import { RequestQueue } from '../../src/infrastructure/codeforces/request-queue';
import { signedIn, loginHtml, submitHtml } from '../fixtures/codeforces';

function secretStore() {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key: string) => data.get(key),
    store: async (key: string, value: string) => {
      data.set(key, value);
    },
    delete: async (key: string) => {
      data.delete(key);
    },
  };
}
describe('authenticated Codeforces session', () => {
  it('sends credentials only to Codeforces and persists cookies, never passwords', async () => {
    const secrets = secretStore(),
      queue = new RequestQueue(0);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(loginHtml, { headers: { 'set-cookie': 'initial=1; Path=/; Secure' } }),
      )
      .mockResolvedValueOnce(
        new Response(signedIn, {
          headers: { 'set-cookie': 'JSESSIONID=session; Path=/; Secure; HttpOnly' },
        }),
      );
    const session = new CodeforcesSession(secrets, queue, fetcher);
    expect(await session.login('tester', 'private-password')).toBe('tester');
    const request = fetcher.mock.calls[1];
    const getHeaders = new Headers(fetcher.mock.calls[0][1]?.headers);
    expect(getHeaders.get('user-agent')).toContain('Chrome/130.0.0.0');
    expect(getHeaders.get('accept')).toContain('application/xhtml+xml');
    expect(getHeaders.get('accept-language')).toBe('en-US,en;q=0.9');
    expect(getHeaders.get('sec-fetch-mode')).toBe('navigate');
    expect(getHeaders.get('sec-fetch-site')).toBe('none');
    expect(getHeaders.has('origin')).toBe(false);
    const postHeaders = new Headers(request[1]?.headers);
    expect(postHeaders.get('sec-fetch-site')).toBe('same-origin');
    expect(postHeaders.get('origin')).toBe('https://codeforces.com');
    expect(String(request[0])).toBe('https://codeforces.com/enter');
    const fields = new URLSearchParams(String(request[1]?.body));
    expect(fields.get('password')).toBe('private-password');
    expect(fields.get('csrf_token')).toBe('login-token');
    expect([...secrets.data.values()].join()).not.toContain('private-password');
    expect([...secrets.data.values()].join()).toContain('session');
    const restored = new CodeforcesSession(secrets, queue, fetcher);
    await restored.restore();
    expect(restored.handle).toBe('tester');
    await restored.logout();
    expect(secrets.data.size).toBe(0);
    queue.dispose();
  });
  it('parses exact available languages and submits one POST with the selected language and snapshot', async () => {
    const queue = new RequestQueue(0),
      secrets = secretStore();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(signedIn))
      .mockResolvedValueOnce(new Response(submitHtml))
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: '/contest/1234/submission/456' } }),
      )
      .mockResolvedValueOnce(new Response(signedIn));
    const session = new CodeforcesSession(secrets, queue, fetcher);
    await session.connectCookie('JSESSIONID=secret');
    const form = await session.submitForm(1234);
    expect(form.languages.map((l) => l.id)).toEqual(['999', '998']);
    expect(await session.submit(1234, 'A', '998', 'print(42)\n', form.fields)).toEqual({
      submissionId: 456,
    });
    const posts = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    const data = new URLSearchParams(String(posts[0][1]?.body));
    expect(data.get('programTypeId')).toBe('998');
    expect(data.get('source')).toBe('print(42)\n');
    expect(data.get('submittedProblemIndex')).toBe('A');
    const redirectedHeaders = new Headers(fetcher.mock.calls[3][1]?.headers);
    expect(fetcher.mock.calls[3][1]?.method).toBe('GET');
    expect(redirectedHeaders.has('content-type')).toBe(false);
    expect(redirectedHeaders.has('origin')).toBe(false);
    queue.dispose();
  });
  it('does not infer a receipt from unrelated status table links', () => {
    expect(
      submissionReceipt(
        `${signedIn}<table><a href="/contest/1234/submission/999">old submission</a></table>`,
        1234,
      ),
    ).toEqual({});
    expect(() =>
      submissionReceipt('<span class="error">Too many submissions</span>', 1234),
    ).toThrow(SubmissionRejectedError);
    expect(formFields('<meta name="X-Csrf-Token" content="meta-token">').get('csrf_token')).toBe(
      'meta-token',
    );
  });
  it('blocks cross-origin redirects, challenge pages and expired sessions', async () => {
    const secrets = secretStore(),
      queue = new RequestQueue(0);
    const redirect = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: 'https://evil.test/collect' } }),
      );
    const session = new CodeforcesSession(secrets, queue, redirect);
    await expect(
      session.page('/enter', new URLSearchParams({ password: 'secret' })),
    ).rejects.toThrow('another origin');
    expect(redirect).toHaveBeenCalledTimes(1);
    const challenge = new CodeforcesSession(
      secrets,
      queue,
      (async () => new Response('<title>Just a moment</title>', { status: 403 })) as typeof fetch,
    );
    await expect(challenge.page('/')).rejects.toBeInstanceOf(SiteVerificationError);
    const expiredFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(signedIn))
      .mockResolvedValueOnce(new Response(loginHtml));
    const expired = new CodeforcesSession(secrets, queue, expiredFetcher);
    await expired.connectCookie('JSESSIONID=old');
    await expect(expired.submitForm(1234)).rejects.toThrow('expired');
    expect(expired.handle).toBeUndefined();
    queue.dispose();
  });
  it('rejects unsupported registration forms instead of guessing missing consent', async () => {
    const secrets = secretStore(),
      queue = new RequestQueue(0);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(signedIn))
      .mockResolvedValueOnce(
        new Response(
          `${signedIn}<form><input type="hidden" name="csrf_token" value="t"><input type="hidden" name="action" value="register"><input type="checkbox" name="acceptRules"></form>`,
        ),
      );
    const session = new CodeforcesSession(secrets, queue, fetcher);
    await session.connectCookie('JSESSIONID=secret');
    await expect(session.registration(1234, true)).rejects.toThrow('consent');
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
    queue.dispose();
  });
});
