import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BrowserSession } from '../../src/infrastructure/codeforces/browser-session';
import { CdpClient } from '../../src/infrastructure/codeforces/cdp-client';
import { parseStatement } from '../../src/infrastructure/codeforces/statement-parser';

// Real product transport, public GETs only; no credentials/challenges/submissions are automated.
describe.skipIf(process.env.CFIDE_DEDICATED_LIVE !== '1')(
  'dedicated native Chrome transport',
  () => {
    it('starts an isolated normal Chrome, connects over CDP, reads a real statement and reconnects', async () => {
      const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-native-browser-live-'));
      const browser = new BrowserSession(profile, () => process.env.CFIDE_BROWSER_EXECUTABLE);
      try {
        await browser.launch();
        const deadline = Date.now() + 15000;
        while (true) {
          try {
            await fs.access(path.join(profile, 'DevToolsActivePort'));
            break;
          } catch (error) {
            if (Date.now() > deadline) throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        await browser.connect();
        const first = await browser.page('/contest/1/problem/A');
        const parsed = parseStatement(first.html, first.url);
        console.info(
          JSON.stringify({
            transport: 'native Chrome + direct CDP',
            title: parsed.statement.title,
            samples: parsed.samples.length,
            firstSample: parsed.samples[0],
          }),
        );
        expect(parsed.statement.title).toContain('Theatre Square');
        expect(parsed.samples[0].input.trim()).toBe('6 6 4');
        expect(parsed.samples[0].expected?.trim()).toBe('4');
        browser.disconnect();
        await browser.connect();
        const second = await browser.page('/contest/2000/problem/A');
        expect(parseStatement(second.html, second.url).statement.title).toContain('Primary Task');
        console.info(
          'Product CDP transport reconnect and second real statement passed. Authenticated login/submission not tested.',
        );
      } finally {
        browser.disconnect();
        // Close only the disposable browser created by this test; never the user's browser.
        try {
          const [port, suffix] = (
            await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
          )
            .trim()
            .split(/\r?\n/);
          const client = await CdpClient.connect(`ws://127.0.0.1:${port}${suffix}`);
          await client.send('Browser.close').catch(() => {});
          client.close();
        } catch {
          /* Browser may already have closed. Preserve its temporary profile for diagnostics. */
        }
      }
    }, 90000);
  },
);
