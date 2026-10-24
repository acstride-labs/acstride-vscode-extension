import { createHash } from 'node:crypto';
import { readChatStream } from './stream';
import type { AiCacheOptions } from '../../shared/ai-protocol';
import type { AiRequestCache } from './request-cache';
import { aiConfigSchema, type AiConfig } from '../../shared/ai-protocol';
export const aiTestMessage =
  'Please reply with a short greeting to confirm that this connection works.';
export function normalizeAiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}
export function redactAiSecret(text: string, key: string) {
  return key ? text.split(key).join('[redacted]') : text;
}
/** Shared OpenAI-compatible Chat Completions transport. */
export class AiClient {
  private streams = new Map<
    string,
    { task: Promise<string>; listeners: Set<(text: string) => void>; latest: string }
  >();
  constructor(
    private request: typeof fetch = fetch,
    private timeoutMs = 30000,
    private cache?: AiRequestCache,
  ) {}
  async test(config: AiConfig, key: string, signal?: AbortSignal): Promise<string> {
    return this.perform(config, key, [{ role: 'user', content: aiTestMessage }], signal);
  }
  configureCache(options: AiCacheOptions) {
    return this.cache?.configure(options);
  }
  async complete(
    config: AiConfig,
    key: string,
    messages: { role: 'system' | 'user'; content: string }[],
    signal?: AbortSignal,
    timeoutMs = this.timeoutMs,
    validate?: (output: string) => void,
    onOutput?: (text: string) => void,
  ): Promise<string> {
    const checked = aiConfigSchema.parse(config);
    const base = normalizeAiBaseUrl(checked.baseUrl);
    const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
    const listeners = new Set<(text: string) => void>();
    const streamKey = createHash('sha256')
      .update(JSON.stringify([endpoint, checked.model, key, messages]))
      .digest('hex');
    if (onOutput) {
      const existing = this.streams.get(streamKey);
      if (existing) {
        existing.listeners.add(onOutput);
        if (existing.latest) onOutput(existing.latest);
        try {
          return await existing.task;
        } finally {
          existing.listeners.delete(onOutput);
        }
      }
      listeners.add(onOutput);
    }
    let lastPublished = 0;
    const publish = (text: string, force = false) => {
      const entry = this.streams.get(streamKey);
      if (entry) entry.latest = text;
      if (!force && Date.now() - lastPublished < 50) return;
      lastPublished = Date.now();
      for (const listener of listeners) {
        try {
          listener(text);
        } catch {}
      }
    };
    const execute = async (requestSignal?: AbortSignal) => {
      const output = await this.perform(
        checked,
        key,
        messages,
        requestSignal,
        timeoutMs,
        onOutput ? publish : undefined,
      );
      validate?.(output);
      return output;
    };
    const task = this.cache
      ? this.cache.request(
          { endpoint, model: checked.model, messages, stream: false },
          (cacheSignal) => execute(signal ? AbortSignal.any([signal, cacheSignal]) : cacheSignal),
          key,
        )
      : execute(signal);
    if (onOutput) this.streams.set(streamKey, { task, listeners, latest: '' });
    try {
      const output = await task;
      if (onOutput) publish(output, true);
      return output;
    } finally {
      if (onOutput) this.streams.delete(streamKey);
    }
  }

  private async perform(
    config: AiConfig,
    key: string,
    messages: { role: 'system' | 'user'; content: string }[],
    signal?: AbortSignal,
    timeoutMs = this.timeoutMs,
    onOutput?: (text: string) => void,
  ): Promise<string> {
    const checked = aiConfigSchema.parse(config);
    const base = normalizeAiBaseUrl(checked.baseUrl);
    const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const response = await this.request(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          model: checked.model,
          messages,
          stream: Boolean(onOutput),
        }),
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      });
      if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
        return redactAiSecret(
          await readChatStream(response, (text) => onOutput?.(redactAiSecret(text, key))),
          key,
        );
      }
      let body: any;
      try {
        body = await response.json();
      } catch {
        throw new Error(`AI service returned invalid JSON (HTTP ${response.status}).`);
      }
      if (!response.ok) {
        const detail =
          typeof body?.error?.message === 'string'
            ? body.error.message
            : typeof body?.message === 'string'
              ? body.message
              : response.statusText;
        throw new Error(
          `AI request failed (HTTP ${response.status}): ${String(detail).slice(0, 2000)}`,
        );
      }
      const message = body?.choices?.[0]?.message;
      const content =
        typeof message?.content === 'string'
          ? message.content
          : Array.isArray(message?.content)
            ? message.content
                .filter((part: any) => typeof part?.text === 'string')
                .map((part: any) => part.text)
                .join('\n')
            : message?.refusal;
      if (typeof content !== 'string' || !content.trim())
        throw new Error('AI service returned no text. Check the model and API compatibility.');
      return redactAiSecret(content.trim(), key);
    } catch (error) {
      if (timeout.aborted)
        throw new Error(
          timeoutMs === 30000
            ? 'AI connection test timed out after 30 seconds.'
            : 'AI translation timed out.',
        );
      if (signal?.aborted) throw new Error('AI connection test cancelled.');
      throw new Error(redactAiSecret(error instanceof Error ? error.message : String(error), key));
    }
  }
}
