import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { RequestQueue } from './request-queue';
import { browserNavigationHeaders } from './browser-headers';

export interface SecretStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}
export interface ProgramType {
  id: string;
  name: string;
}
const SECRET = 'cfide.codeforces.session.v1';
export class SiteVerificationError extends Error {
  constructor() {
    super(
      'Codeforces requires browser/site verification. IDE login/submission is unavailable until verification is resolved. No submission success has been assumed.',
    );
  }
}
export class SubmissionRejectedError extends Error {}
const stateSchema = z.object({
  handle: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
  jar: z.unknown(),
  ftaa: z.string(),
  bfaa: z.string(),
});

export function loggedHandle(html: string): string | undefined {
  const $ = cheerio.load(html);
  if (!$('a[href*="/logout"]').length) return undefined;
  const match = /\bhandle\s*=\s*["']([A-Za-z0-9_.-]+)["']/.exec(html);
  if (match) return match[1];
  const href = $('.lang-chooser a[href^="/profile/"]').first().attr('href');
  return href?.split('/').pop();
}
export function formFields(html: string, formSelector = 'form'): URLSearchParams {
  const $ = cheerio.load(html),
    fields = new URLSearchParams();
  $(formSelector)
    .first()
    .find('input[type="hidden"][name]')
    .each((_, input) => fields.set($(input).attr('name')!, $(input).attr('value') || ''));
  const token =
    fields.get('csrf_token') ||
    $('meta[name="X-Csrf-Token"]').attr('content') ||
    /\bcsrf\s*=\s*["']([^"']+)["']/.exec(html)?.[1];
  if (!token)
    throw new Error(
      'Codeforces form token is missing. Sign in again or resolve site verification.',
    );
  fields.set('csrf_token', token);
  return fields;
}
export function submissionReceipt(
  html: string,
  contestId: number,
): { submissionId?: number; message?: string } {
  const $ = cheerio.load(html),
    errors = $('.error, .error__message')
      .map((_, n) => $(n).text().trim())
      .get()
      .filter(Boolean);
  if (errors.length) throw new SubmissionRejectedError(errors.join(' ').slice(0, 500));
  // A dedicated receipt URL may identify the submission. Never guess from a status-table row.
  const message = $('.notice, .message').text();
  if (/submitted successfully/i.test(message))
    return { message: 'Codeforces acknowledged receipt; matching submission ID.' };
  return {};
}

export class CodeforcesSession {
  private jar = new CookieJar();
  handle?: string;
  private ftaa = '';
  private bfaa = '';
  constructor(
    private secrets: SecretStore,
    private queue: RequestQueue,
    private fetcher: typeof fetch = fetch,
  ) {}
  async restore() {
    const raw = await this.secrets.get(SECRET);
    if (!raw) return;
    try {
      const state = stateSchema.parse(JSON.parse(raw));
      this.jar = CookieJar.deserializeSync(state.jar as any);
      this.handle = state.handle;
      this.ftaa = state.ftaa;
      this.bfaa = state.bfaa;
    } catch {
      await this.logout();
    }
  }
  private async persist() {
    if (this.handle)
      await this.secrets.store(
        SECRET,
        JSON.stringify({
          handle: this.handle,
          jar: this.jar.serializeSync(),
          ftaa: this.ftaa,
          bfaa: this.bfaa,
        }),
      );
  }
  async logout() {
    this.handle = undefined;
    this.jar = new CookieJar();
    this.ftaa = '';
    this.bfaa = '';
    await this.secrets.delete(SECRET);
  }
  async page(pathname: string, body?: URLSearchParams): Promise<{ html: string; url: string }> {
    if (!pathname.startsWith('/') || pathname.startsWith('//'))
      throw new Error('Invalid Codeforces path.');
    return this.queue.schedule(
      async () => {
        let url = new URL(pathname, 'https://codeforces.com'),
          method = body ? 'POST' : 'GET',
          payload = body?.toString();
        for (let redirect = 0; redirect < 6; redirect++) {
          if (url.origin !== 'https://codeforces.com')
            throw new Error('Refused to send Codeforces credentials to another origin.');
          const cookie = await this.jar.getCookieString(url.href);
          const response = await this.fetcher(url, {
            method,
            body: payload,
            redirect: 'manual',
            signal: AbortSignal.timeout(20000),
            headers: {
              ...browserNavigationHeaders(
                method,
                body || redirect > 0 ? new URL(pathname, 'https://codeforces.com').href : undefined,
              ),
              Cookie: cookie,
            },
          });
          for (const value of response.headers.getSetCookie())
            await this.jar.setCookie(value, url.href);
          const location = response.headers.get('location');
          if ([301, 302, 303, 307, 308].includes(response.status) && location) {
            if ([301, 302, 303].includes(response.status)) {
              method = 'GET';
              payload = undefined;
            }
            url = new URL(location, url);
            continue;
          }
          const html = await response.text();
          if (
            response.status === 403 ||
            /cf-chl-|<title>\s*Just a moment|id=["']challenge-form/i.test(html)
          )
            throw new SiteVerificationError();
          if (!response.ok) throw new Error(`Codeforces website HTTP ${response.status}.`);
          if (html.length > 10000000)
            throw new Error('Codeforces page exceeds the supported size.');
          await this.persist();
          return { html, url: url.href };
        }
        throw new Error('Codeforces redirected too many times.');
      },
      body ? 0 : 10,
    );
  }
  async login(handleOrEmail: string, password: string) {
    const previous = { jar: this.jar, handle: this.handle, ftaa: this.ftaa, bfaa: this.bfaa };
    this.jar = new CookieJar();
    this.handle = undefined;
    try {
      const page = await this.page('/enter');
      const fields = formFields(page.html, '#enterForm');
      this.ftaa = fields.get('ftaa') || randomBytes(9).toString('hex');
      this.bfaa = fields.get('bfaa') || '';
      for (const [key, value] of Object.entries({
        action: 'enter',
        handleOrEmail,
        password,
        remember: 'on',
        ftaa: this.ftaa,
        bfaa: this.bfaa,
      }))
        fields.set(key, value);
      const result = await this.page('/enter', fields);
      const handle = loggedHandle(result.html);
      if (!handle) {
        const $ = cheerio.load(result.html);
        throw new Error(
          $('.error').text().trim().slice(0, 300) ||
            'Codeforces did not confirm login. CAPTCHA/2FA/browser verification cannot be completed by this form adapter.',
        );
      }
      this.handle = handle;
      await this.persist();
      return handle;
    } catch (error) {
      this.jar = previous.jar;
      this.handle = previous.handle;
      this.ftaa = previous.ftaa;
      this.bfaa = previous.bfaa;
      if (this.handle) await this.persist();
      else await this.secrets.delete(SECRET);
      throw error;
    }
  }
  async connectCookie(cookieHeader: string) {
    const previous = { jar: this.jar, handle: this.handle };
    this.jar = new CookieJar();
    this.handle = undefined;
    try {
      for (const part of cookieHeader.split(';'))
        if (part.trim())
          await this.jar.setCookie(`${part.trim()}; Path=/; Secure`, 'https://codeforces.com');
      const page = await this.page('/');
      const handle = loggedHandle(page.html);
      if (!handle) throw new Error('Codeforces did not recognize this session.');
      this.handle = handle;
      await this.persist();
      return handle;
    } catch (error) {
      this.jar = previous.jar;
      this.handle = previous.handle;
      throw error;
    }
  }
  async submitForm(
    contestId: number,
  ): Promise<{ fields: URLSearchParams; languages: ProgramType[] }> {
    if (!this.handle) throw new Error('Sign in to Codeforces first.');
    const { html } = await this.page(`/contest/${contestId}/submit`);
    const handle = loggedHandle(html);
    if (!handle || handle.toLowerCase() !== this.handle.toLowerCase()) {
      await this.logout();
      throw new Error('Codeforces session expired or account changed. Sign in again.');
    }
    const $ = cheerio.load(html);
    const languages = $('select[name="programTypeId"] option')
      .toArray()
      .map((n) => ({ id: $(n).attr('value') || '', name: $(n).text().trim() }))
      .filter((l) => /^\d+$/.test(l.id));
    if (!languages.length)
      throw new Error(
        'No submission languages found. Check contest registration, access and session.',
      );
    return { fields: formFields(html, 'form.submit-form, form#submitForm'), languages };
  }
  async submit(
    contestId: number,
    index: string,
    language: string,
    source: string,
    fields: URLSearchParams,
  ) {
    for (const [key, value] of Object.entries({
      action: 'submitSolutionFormSubmitted',
      submittedProblemIndex: index,
      programTypeId: language,
      contestId: String(contestId),
      source,
      tabSize: '4',
      sourceCodeConfirmed: 'true',
      ftaa: this.ftaa,
      bfaa: this.bfaa,
    }))
      fields.set(key, value);
    const result = await this.page(
      `/contest/${contestId}/submit?csrf_token=${encodeURIComponent(fields.get('csrf_token') || '')}`,
      fields,
    );
    if (!loggedHandle(result.html))
      throw new Error(
        'Submission response did not confirm the signed-in account; receipt is uncertain.',
      );
    const id = new RegExp(`/contest/${contestId}/submission/(\\d+)`).exec(
      new URL(result.url).pathname,
    )?.[1];
    if (id) return { submissionId: Number(id) };
    return submissionReceipt(result.html, contestId);
  }
  async registration(contestId: number, register = false): Promise<string> {
    if (!this.handle) throw new Error('Sign in to Codeforces first.');
    const path = `/contestRegistration/${contestId}`;
    let { html } = await this.page(path);
    if (!loggedHandle(html)) throw new Error('Your Codeforces session has expired.');
    if (register) {
      const fields = formFields(html);
      if (!/register|registration/i.test(fields.get('action') || ''))
        throw new Error('Registration form was not recognized. No registration request was sent.');
      const $ = cheerio.load(html);
      if ($('input[type="checkbox"]').length)
        throw new Error(
          'Registration requires additional consent/options that this version cannot display. No registration request was sent.',
        );
      html = (await this.page(path, fields)).html;
    }
    const $ = cheerio.load(html);
    return sanitizeRegistrationText($('.notice, .error, #pageContent').text());
  }
}
function sanitizeRegistrationText(text: string) {
  return (
    text.replace(/\s+/g, ' ').trim().slice(0, 3000) ||
    'Registration status could not be determined.'
  );
}
