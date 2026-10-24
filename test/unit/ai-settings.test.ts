import { expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { AiClient, aiTestMessage } from '../../src/infrastructure/ai/client';
import { AiSettings } from '../../src/vscode/ai-settings';
import { aiConfigSchema } from '../../src/shared/ai-protocol';
const config = { baseUrl: 'https://models.example/v1/', model: 'test-model' };
it('sends one fixed message to the configured endpoint and returns the model text', async () => {
  const request = vi.fn(async () =>
    Response.json({ choices: [{ message: { content: 'Hello from the model' } }] }),
  );
  const client = new AiClient(request as unknown as typeof fetch);
  expect(await client.test(config, 'test-secret')).toBe('Hello from the model');
  expect(request).toHaveBeenCalledWith(
    'https://models.example/v1/chat/completions',
    expect.objectContaining({
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret' },
    }),
  );
  const body = JSON.parse(
    (request.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(body).toEqual({
    model: 'test-model',
    messages: [{ role: 'user', content: aiTestMessage }],
    stream: false,
  });
});
it('supports local services without API keys and an explicitly supplied completion endpoint', async () => {
  const request = vi.fn(async () =>
    Response.json({ choices: [{ message: { content: [{ type: 'text', text: 'Local reply' }] } }] }),
  );
  expect(
    await new AiClient(request as unknown as typeof fetch).test(
      { baseUrl: 'http://localhost:11434/v1/chat/completions', model: 'local' },
      '',
    ),
  ).toBe('Local reply');
  expect(request).toHaveBeenCalledWith(
    'http://localhost:11434/v1/chat/completions',
    expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
  );
});
it('shows useful HTTP errors without leaking credentials, and rejects invalid/empty replies', async () => {
  const request = vi.fn(async () =>
    Response.json({ error: { message: 'Invalid key test-secret' } }, { status: 401 }),
  );
  await expect(
    new AiClient(request as unknown as typeof fetch).test(config, 'test-secret'),
  ).rejects.toThrow('HTTP 401): Invalid key [redacted]');
  request.mockResolvedValueOnce(new Response('<html>Error</html>', { status: 502 }));
  await expect(new AiClient(request as unknown as typeof fetch).test(config, '')).rejects.toThrow(
    'invalid JSON (HTTP 502)',
  );
  request.mockResolvedValueOnce(Response.json({ choices: [] }));
  await expect(new AiClient(request as unknown as typeof fetch).test(config, '')).rejects.toThrow(
    'no text',
  );
});
it('does not follow provider redirects and supports cancellation', async () => {
  const abort = new AbortController();
  const request = vi.fn(
    async (_url: any, init: any) =>
      new Promise<Response>((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
  );
  const pending = new AiClient(request as unknown as typeof fetch).test(
    config,
    'test-secret',
    abort.signal,
  );
  abort.abort();
  await expect(pending).rejects.toThrow('cancelled');
});
it('stores keys only in SecretStorage and never reuses a key for a changed endpoint', async () => {
  const data = new Map<string, unknown>();
  const secrets = new Map<string, string>();
  const context = {
    globalState: {
      get: (key: string) => data.get(key),
      update: async (key: string, value: unknown) => {
        data.set(key, value);
      },
    },
    secrets: {
      get: async (key: string) => secrets.get(key),
      store: async (key: string, value: string) => {
        secrets.set(key, value);
      },
      delete: async (key: string) => {
        secrets.delete(key);
      },
    },
  } as unknown as vscode.ExtensionContext;
  const store = new AiSettings(context);
  await store.save(config, 'test-secret');
  expect(await store.state()).toEqual({
    config: { ...config, baseUrl: 'https://models.example/v1' },
    hasKey: true,
  });
  expect(JSON.stringify([...data.values()])).not.toContain('test-secret');
  expect(JSON.stringify(await store.state())).not.toContain('test-secret');
  expect(await store.key({ ...config, baseUrl: 'https://other.example/v1' })).toBe('');
  await store.save({ ...config, baseUrl: 'https://other.example/v1' });
  expect((await store.state()).hasKey).toBe(false);
  await store.save(config);
  await store.forgetKey();
  expect((await store.state()).hasKey).toBe(false);
});
it('rejects URL-embedded credentials and non-local unencrypted endpoints', () => {
  for (const baseUrl of [
    'http://models.example/v1',
    'https://user:password@models.example/v1',
    'https://models.example/v1?key=secret',
  ])
    expect(aiConfigSchema.safeParse({ ...config, baseUrl }).success).toBe(false);
});
