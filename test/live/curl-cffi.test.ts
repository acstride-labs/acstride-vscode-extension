import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as cheerio from 'cheerio';
import { parseStatement } from '../../src/infrastructure/codeforces/statement-parser';

const exec = promisify(execFile);
// Opt-in, public GET requests only. No cookies are imported and no credentials are requested.
describe.skipIf(process.env.CFIDE_CURL_LIVE !== '1')('curl_cffi live compatibility probe', () => {
  it('downloads multiple real statements and the login form using one browser-profile session', async () => {
    const python = process.env.CFIDE_CURL_PYTHON || 'python3';
    const script = `
import json, time
from curl_cffi import requests
paths = ['/contest/1/problem/A', '/contest/1/problem/B', '/contest/2000/problem/A', '/enter']
results = []
with requests.Session(impersonate='chrome') as session:
    for path in paths:
        try:
            response = session.get('https://codeforces.com' + path, timeout=20, allow_redirects=False)
            results.append({'path': path, 'status': response.status_code, 'html': response.text})
        except Exception as error:
            results.append({'path': path, 'status': 0, 'html': '', 'errorType': type(error).__name__})
        time.sleep(2.1)
print(json.dumps(results))
`;
    const { stdout } = await exec(python, ['-c', script], { timeout: 100000, maxBuffer: 5000000 });
    const results = JSON.parse(stdout) as {
      path: string;
      status: number;
      html: string;
      errorType?: string;
    }[];
    const summaries = results.map((r) => {
      try {
        if (r.path === '/enter')
          return {
            path: r.path,
            status: r.status,
            loginForm: !!cheerio.load(r.html)('#enterForm').length,
          };
        const parsed = parseStatement(r.html, `https://codeforces.com${r.path}`);
        return {
          path: r.path,
          status: r.status,
          title: parsed.statement.title,
          samples: parsed.samples.length,
          firstSample: parsed.samples[0],
        };
      } catch {
        return {
          path: r.path,
          status: r.status,
          pageTitle: cheerio.load(r.html)('title').text().slice(0, 120),
          errorType: r.errorType,
        };
      }
    });
    console.info(JSON.stringify(summaries, null, 2));
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.status, r.path).toBe(200);
      if (r.path === '/enter') expect(cheerio.load(r.html)('#enterForm').length).toBe(1);
      else
        expect(
          parseStatement(r.html, `https://codeforces.com${r.path}`).samples.length,
        ).toBeGreaterThan(0);
    }
    const first = parseStatement(results[0].html, 'https://codeforces.com/contest/1/problem/A');
    expect(first.samples[0].input.trim()).toBe('6 6 4');
    expect(first.samples[0].expected?.trim()).toBe('4');
  }, 110000);
});
