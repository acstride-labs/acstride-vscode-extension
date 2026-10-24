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
  ): Promise<string> {
    const checked = aiConfigSchema.parse(config);
    const base = normalizeAiBaseUrl(checked.baseUrl);
    const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
    const execute = async (requestSignal?: AbortSignal) => {
      const output = await this.perform(checked, key, messages, requestSignal, timeoutMs);
      validate?.(output);
      return output;
    };
    if (!this.cache) return execute(signal);
    return this.cache.request(
      { endpoint, model: checked.model, messages, stream: false },
      (cacheSignal) => execute(signal ? AbortSignal.any([signal, cacheSignal]) : cacheSignal),
      key,
    );
  }

  private async perform(
    config: AiConfig,
    key: string,
    messages: { role: 'system' | 'user'; content: string }[],
    signal?: AbortSignal,
    timeoutMs = this.timeoutMs,
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
          stream: false,
        }),
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      });
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
