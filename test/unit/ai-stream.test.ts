import { expect, it, vi } from 'vitest';
import { AiClient } from '../../src/infrastructure/ai/client';
import { readChatStream } from '../../src/infrastructure/ai/stream';
import { AiRequestCache } from '../../src/infrastructure/ai/request-cache';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const config = { baseUrl: 'https://example.com/v1', model: 'test' };
const frame = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\r\n\r\n`;
function response(text: string, split = 1) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
it('decodes split SSE frames and multibyte text and emits accumulated output', async () => {
  const chunks: string[] = [];
  expect(
    await readChatStream(
      response(': ping\r\n\r\n' + frame('你') + frame('好') + 'data: [DONE]\r\n\r\n'),
      (text) => chunks.push(text),
    ),
  ).toBe('你好');
  expect(chunks).toEqual(['你', '你好']);
});
it('rejects disconnected, truncated and error streams instead of treating partial output as complete', async () => {
  await expect(readChatStream(response(frame('partial')), () => {})).rejects.toThrow(
    'before completion',
  );
  await expect(
    readChatStream(
      response(frame('partial') + 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n'),
      () => {},
    ),
  ).rejects.toThrow('incomplete');
  await expect(
    readChatStream(response('data: {"error":{"message":"failed"}}\n\n'), () => {}),
  ).rejects.toThrow('failed');
});
it('shares an active stream, replays current output to new viewers, and caches only the final result', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-stream-'));
  const cache = new AiRequestCache(path.join(dir, 'cache.json'));
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const request = vi.fn<typeof fetch>(
    async () =>
      new Response(
        new ReadableStream({
          start(value) {
            controller = value;
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  );
  const client = new AiClient(request, 30000, cache);
  const a: string[] = [],
    b: string[] = [];
  const messages = [{ role: 'user' as const, content: 'test' }];
  try {
    const first = client.complete(config, '', messages, undefined, 30000, undefined, (text) =>
      a.push(text),
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    controller.enqueue(new TextEncoder().encode(frame('first')));
    await vi.waitFor(() => expect(a).toContain('first'));
    const second = client.complete(config, '', messages, undefined, 30000, undefined, (text) =>
      b.push(text),
    );
    expect(b).toContain('first');
    controller.enqueue(new TextEncoder().encode(frame(' second') + 'data: [DONE]\n\n'));
    controller.close();
    expect(await first).toBe('first second');
    expect(await second).toBe('first second');
    expect(request).toHaveBeenCalledTimes(1);
    const cached: string[] = [];
    await client.complete(config, '', messages, undefined, 30000, undefined, (text) =>
      cached.push(text),
    );
    expect(cached).toEqual(['first second']);
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0][1]!.body as string).stream).toBe(true);
  } finally {
    cache.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
it('accepts a compatible provider returning complete JSON even when streaming was requested', async () => {
  const output: string[] = [];
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ choices: [{ message: { content: 'complete' } }] }),
  );
  const client = new AiClient(request);
  expect(
    await client.complete(config, '', [], undefined, 30000, undefined, (text) => output.push(text)),
  ).toBe('complete');
  expect(output).toEqual(['complete']);
});

it('never caches a disconnected partial response and permits a fresh retry', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ai-stream-failed-'));
  const cache = new AiRequestCache(path.join(dir, 'cache.json'));
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response(frame('partial')))
    .mockResolvedValueOnce(response(frame('complete') + 'data: [DONE]\n\n'));
  const client = new AiClient(request, 30000, cache);
  try {
    await expect(
      client.complete(config, '', [], undefined, 30000, undefined, () => {}),
    ).rejects.toThrow('before completion');
    expect(await client.complete(config, '', [], undefined, 30000, undefined, () => {})).toBe(
      'complete',
    );
    expect(request).toHaveBeenCalledTimes(2);
  } finally {
    cache.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
