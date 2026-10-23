import * as cheerio from 'cheerio';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Statement } from '../../domain/contest';
import { RequestQueue } from './request-queue';
export async function cacheStatementAssets(
  statement: Statement,
  folder: string,
  queue: RequestQueue,
  fetcher: typeof fetch = fetch,
): Promise<Statement> {
  const $ = cheerio.load(statement.html, undefined, false);
  let failures = 0;
  for (const image of $('img').toArray().slice(0, 50)) {
    const src = $(image).attr('src');
    if (!src) continue;
    try {
      const url = new URL(src);
      if (
        url.protocol !== 'https:' ||
        !['codeforces.com', 'codeforces.org'].some(
          (host) => url.hostname === host || url.hostname.endsWith('.' + host),
        )
      )
        throw new Error('External image is not cached.');
      const response = await queue.schedule(
        () => fetcher(url, { signal: AbortSignal.timeout(8000), redirect: 'error' }),
        15,
      );
      const ext = (
        {
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/gif': 'gif',
          'image/webp': 'webp',
        } as Record<string, string>
      )[(response.headers.get('content-type') || '').split(';')[0]];
      if (!response.ok || !ext || Number(response.headers.get('content-length')) > 5000000)
        throw new Error('Image is not cacheable.');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No image body.');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.length;
        if (size > 5000000) {
          await reader.cancel();
          throw new Error('Image exceeds cache size limit.');
        }
        chunks.push(item.value);
      }
      const bytes = Buffer.concat(chunks),
        name = createHash('sha256').update(bytes).digest('hex') + '.' + ext;
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(path.join(folder, name), bytes);
      $(image).attr('src', 'cfide-asset:' + name);
    } catch {
      failures++;
    }
  }
  if ($('img').length > 50) failures += $('img').length - 50;
  return {
    ...statement,
    html: $.html(),
    imageWarning: failures
      ? `${failures} image(s) could not be cached and may require network access.`
      : undefined,
  };
}
