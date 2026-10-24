import { it, expect, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AiRequestCache, type AiRequestInput } from '../../src/infrastructure/ai/request-cache';
import { AiClient } from '../../src/infrastructure/ai/client';
import { sanitizeTranslation } from '../../src/infrastructure/ai/translation';
import { defaultAiCacheOptions } from '../../src/shared/ai-protocol';
const input = (text: string): AiRequestInput => ({
  endpoint: 'https://models.example/v1/chat/completions',
  model: 'test',
  messages: [{ role: 'user', content: text }],
  stream: false,
});
it('coalesces generic requests and persists actual input/output with LRU touch and restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-cache-'));
  const file = path.join(dir, 'cache.json');
  const cache = new AiRequestCache(file, { ...defaultAiCacheOptions, maxEntries: 2 });
  let calls = 0;
  const run = async () => {
    calls++;
    return 'model output';
  };
  try {
    const [a, b] = await Promise.all([
      cache.request(input('one'), run, 'private-key'),
      cache.request(input('one'), run, 'private-key'),
    ]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    const stored = await readFile(file, 'utf8');
    expect(stored).toContain('"input"');
    expect(stored).toContain('"output":"model output"');
    expect(stored).toContain('"content":"one"');
    expect(stored).not.toContain('private-key');
    await cache.request(input('two'), run, 'private-key');
    await cache.request(input('one'), run, 'private-key');
    await cache.request(input('three'), run, 'private-key');
    const restored = new AiRequestCache(file, { ...defaultAiCacheOptions, maxEntries: 2 });
    await restored.request(input('one'), run, 'private-key');
    expect(calls).toBe(3);
    await restored.request(input('two'), run, 'private-key');
    expect(calls).toBe(4);
    restored.dispose();
  } finally {
    cache.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
it('bypasses cache when disabled, rejects failed results and enforces storage limits', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-cache-'));
  const cache = new AiRequestCache(path.join(dir, 'cache.json'), {
    ...defaultAiCacheOptions,
    maxSizeMb: 1,
  });
  const run = vi.fn(async () => 'x'.repeat(1024 * 1024));
  try {
    await cache.request(input('keep'), async () => 'small cached result');
    await cache.request(input('large'), run);
    await cache.request(input('large'), run);
    expect(run).toHaveBeenCalledTimes(2);
    expect(
      await cache.request(input('keep'), async () => {
        throw new Error('should remain cached');
      }),
    ).toBe('small cached result');
    await expect(
      cache.request(input('failure'), async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('offline');
    expect(await cache.request(input('failure'), async () => 'retry works')).toBe('retry works');
    await cache.configure({ ...defaultAiCacheOptions, enabled: false });
    const fresh = vi.fn(async () => 'fresh');
    await cache.request(input('off'), fresh);
    await cache.request(input('off'), fresh);
    expect(fresh).toHaveBeenCalledTimes(2);
  } finally {
    cache.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
it('caches all AI completions before transport while connection tests stay live', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-cache-'));
  const cache = new AiRequestCache(path.join(dir, 'cache.json'));
  const request = vi.fn(async () =>
    Response.json({ choices: [{ message: { content: 'reply' } }] }),
  );
  const client = new AiClient(request as typeof fetch, 30000, cache);
  const config = { baseUrl: 'https://models.example/v1', model: 'test' };
  const messages = input('hello').messages;
  try {
    await client.complete(config, 'secret', messages);
    await client.complete(config, 'secret', messages);
    expect(request).toHaveBeenCalledTimes(1);
    await client.complete(config, 'different-secret', messages);
    expect(request).toHaveBeenCalledTimes(2);
    await client.test(config, 'secret');
    await client.test(config, 'secret');
    expect(request).toHaveBeenCalledTimes(4);
    await client.complete({ ...config, model: 'other' }, 'secret', messages);
    expect(request).toHaveBeenCalledTimes(5);
  } finally {
    cache.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
it('sanitizes cached translation output only at rendering, preserving formulas and allowed local images', () => {
  const asset = 'a'.repeat(64) + '.png';
  const html = sanitizeTranslation(
    '<p onclick="bad()">$$$x$$$</p><script>bad()</script><img src="codeforces-workbench-asset:' + asset + '">',
    '<img src="codeforces-workbench-asset:' + asset + '">',
  );
  expect(html).not.toContain('onclick');
  expect(html).not.toContain('script');
  expect(html).toContain('$$$x$$$');
  expect(html).toContain('codeforces-workbench-asset:' + asset);
});

it('does not cache semantically invalid assistant output so retry reaches the model', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-validate-'));
  const cache = new AiRequestCache(path.join(dir, 'cache.json'), defaultAiCacheOptions);
  const fetcher = vi.fn(async () =>
    Response.json({ choices: [{ message: { content: 'invalid' } }] }),
  );
  const client = new AiClient(fetcher as unknown as typeof fetch, 30000, cache);
  const validate = (output: string) => {
    if (output !== 'valid') throw new Error('invalid hints');
  };
  const config = { baseUrl: 'https://models.example/v1', model: 'test' };
  try {
    await expect(
      client.complete(config, '', input('hint').messages, undefined, 30000, validate),
    ).rejects.toThrow('invalid hints');
    fetcher.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: 'valid' } }] }));
    await expect(
      client.complete(config, '', input('hint').messages, undefined, 30000, validate),
    ).resolves.toBe('valid');
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    cache.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});

it.each([true, false])(
  'limits AI requests to ten and releases slots after success or failure (cache=%s)',
  async (enabled) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-concurrency-'));
    const cache = new AiRequestCache(path.join(dir, 'cache.json'), {
      ...defaultAiCacheOptions,
      enabled,
    });
    const gates = new Map<
      number,
      { resolve: (value: string) => void; reject: (error: Error) => void }
    >();
    let active = 0,
      peak = 0;
    let cleaning = false;
    const started: number[] = [];
    const settled = Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        cache.request(input(`job-${index}`), async () => {
          started.push(index);
          active++;
          peak = Math.max(peak, active);
          try {
            if (cleaning) return 'cleanup';
            return await new Promise<string>((resolve, reject) => {
              gates.set(index, { resolve, reject });
            });
          } finally {
            active--;
          }
        }),
      ),
    );
    try {
      await vi.waitFor(() => expect(started).toHaveLength(10));
      expect(active).toBe(10);
      gates.get(0)!.resolve('done');
      await vi.waitFor(() => expect(started).toHaveLength(11));
      gates.get(1)!.reject(new Error('offline'));
      await vi.waitFor(() => expect(started).toHaveLength(12));
      for (let index = 2; index < 12; index++) gates.get(index)!.resolve('done');
      const results = await settled;
      expect(peak).toBe(10);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(11);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    } finally {
      cleaning = true;
      cache.dispose();
      for (const gate of gates.values()) gate.resolve('cleanup');
      await settled;
      await rm(dir, { recursive: true, force: true });
    }
  },
);
