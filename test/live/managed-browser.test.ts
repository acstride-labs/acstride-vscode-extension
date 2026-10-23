import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { parseStatement } from '../../src/infrastructure/codeforces/statement-parser';

// Explicitly opt in to the user-requested managed-browser experiment.
// A dedicated profile is required; never point it at the user's daily browser profile.
describe.skipIf(process.env.CFIDE_BROWSER_LIVE !== '1')('managed Chrome read-only probe', () => {
  it('loads real statements and a usable login form in a dedicated visible browser', async () => {
    const modulePath = process.env.CFIDE_PLAYWRIGHT_MODULE;
    const profile = process.env.CFIDE_BROWSER_PROFILE;
    if (!modulePath || !profile || !profile.startsWith('/private/tmp/cfide-http-probe-'))
      throw new Error('Set an isolated temporary probe profile and playwright-core module path.');
    const { chromium } = await import(/* @vite-ignore */ pathToFileURL(modulePath).href);
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1200, height: 850 },
      chromiumSandbox: true,
    });
    try {
      const page = context.pages()[0] || (await context.newPage());
      for (const url of [
        'https://codeforces.com/contest/1/problem/A',
        'https://codeforces.com/contest/2000/problem/A',
        'https://codeforces.com/enter',
      ]) {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const selector = url.endsWith('/enter') ? '#enterForm' : '.problem-statement';
        // No challenge interaction, credential entry, or form submission is automated here.
        try {
          await page.locator(selector).waitFor({ timeout: 15000 });
        } catch {
          /* Report the actual page below. */
        }
        const html = await page.content();
        const present = await page.locator(selector).count();
        console.info(
          JSON.stringify({
            url,
            initialStatus: response?.status(),
            title: await page.title(),
            expectedContentPresent: !!present,
          }),
        );
        expect(present, url).toBeGreaterThan(0);
        if (!url.endsWith('/enter'))
          expect(parseStatement(html, url).samples.length).toBeGreaterThan(0);
      }
    } finally {
      await context.close();
    }
  }, 150000);
});
