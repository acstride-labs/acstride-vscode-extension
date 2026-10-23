import { afterEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { cacheStatementAssets } from '../../src/infrastructure/codeforces/asset-cache';
import { RequestQueue } from '../../src/infrastructure/codeforces/request-queue';

let folder: string | undefined;
afterEach(async () => {
  if (folder) await fs.rm(folder, { recursive: true, force: true });
});
it('caches only supported host images and retains warnings for unavailable assets', async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-assets-test-'));
  const queue = new RequestQueue(0),
    urls: string[] = [];
  const result = await cacheStatementAssets(
    {
      title: 'A',
      html: '<img src="https://codeforces.org/test.png"><img src="https://external.test/test.png"><img src="https://codeforces.com/vector.svg">',
      timeLimit: '',
      memoryLimit: '',
      fetchedAt: 1,
    },
    folder,
    queue,
    (async (url) => {
      urls.push(String(url));
      return new Response('fixture-image-bytes', {
        headers: { 'content-type': String(url).endsWith('.svg') ? 'image/svg+xml' : 'image/png' },
      });
    }) as typeof fetch,
  );
  expect(result.html).toMatch(/cfide-asset:[a-f0-9]{64}\.png/);
  expect(result.imageWarning).toContain('2 image(s)');
  expect(urls).toHaveLength(2);
  expect(await fs.readdir(folder)).toHaveLength(1);
  queue.dispose();
});
