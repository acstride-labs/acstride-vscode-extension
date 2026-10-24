import {
  assistantOptionsSchema,
  defaultAssistantOptions,
  defaultAssistantPrompts,
  previousAssistantPrompts,
  assistantKinds,
  type AssistantOptions,
} from '../shared/ai-assistance';
import type * as vscode from 'vscode';
import {
  defaultTranslationOptions,
  defaultAiCacheOptions,
  aiCacheOptionsSchema,
  type AiCacheOptions,
  legacyTranslationPrompt,
  previousEnglishTranslationPrompt,
  defaultTranslationPrompt,
  translationOptionsSchema,
  type TranslationOptions,
  aiConfigSchema,
  type AiConfig,
} from '../shared/ai-protocol';
import { normalizeAiBaseUrl } from '../infrastructure/ai/client';
const configKey = 'cfide.aiConfig';
/** Credentials are bound to the configured endpoint, so editing Base URL never forwards an old key. */
export class AiSettings {
  private static translationListeners = new Set<() => void>();
  onTranslationChanged(listener: () => void) {
    AiSettings.translationListeners.add(listener);
    return {
      dispose: () => {
        AiSettings.translationListeners.delete(listener);
      },
    };
  }
  constructor(private context: Pick<vscode.ExtensionContext, 'globalState' | 'secrets'>) {}
  private keyId(baseUrl: string) {
    return `cfide.ai.apiKey:${normalizeAiBaseUrl(baseUrl)}`;
  }
  config(): AiConfig {
    const value = this.context.globalState.get<unknown>(configKey);
    const parsed = aiConfigSchema.safeParse(value);
    return parsed.success ? parsed.data : { baseUrl: '', model: '' };
  }
  async key(config: AiConfig) {
    return (await this.context.secrets.get(this.keyId(config.baseUrl))) ?? '';
  }
  translationOptions(): TranslationOptions {
    const parsed = translationOptionsSchema.safeParse(
      this.context.globalState.get('cfide.translationOptions'),
    );
    if (!parsed.success) return { ...defaultTranslationOptions };
    return [legacyTranslationPrompt, previousEnglishTranslationPrompt].includes(parsed.data.prompt)
      ? { ...parsed.data, prompt: defaultTranslationPrompt }
      : parsed.data;
  }
  async saveTranslationOptions(options: TranslationOptions) {
    await this.context.globalState.update(
      'cfide.translationOptions',
      translationOptionsSchema.parse(options),
    );
    for (const listener of AiSettings.translationListeners) listener();
  }
  assistanceOptions(): AssistantOptions {
    const parsed = assistantOptionsSchema.safeParse(
      this.context.globalState.get('cfide.assistanceOptions'),
    );
    const options = parsed.success
      ? parsed.data
      : defaultAssistantOptions(this.translationOptions().targetLanguage);
    for (const kind of assistantKinds) {
      if (options[kind].prompt === previousAssistantPrompts[kind]) {
        options[kind].prompt = defaultAssistantPrompts[kind];
      }
    }
    return options;
  }
  async saveAssistanceOptions(options: AssistantOptions) {
    await this.context.globalState.update(
      'cfide.assistanceOptions',
      assistantOptionsSchema.parse(options),
    );
    for (const listener of AiSettings.translationListeners) listener();
  }
  cacheOptions(): AiCacheOptions {
    const parsed = aiCacheOptionsSchema.safeParse(
      this.context.globalState.get('cfide.aiCacheOptions'),
    );
    return parsed.success ? parsed.data : { ...defaultAiCacheOptions };
  }
  async saveCacheOptions(options: AiCacheOptions) {
    await this.context.globalState.update(
      'cfide.aiCacheOptions',
      aiCacheOptionsSchema.parse(options),
    );
  }
  async state() {
    const config = this.config();
    return { config, hasKey: !!(await this.key(config)) };
  }
  async save(config: AiConfig, key?: string) {
    const checked = aiConfigSchema.parse(config);
    checked.baseUrl = normalizeAiBaseUrl(checked.baseUrl);
    if (key?.trim()) await this.context.secrets.store(this.keyId(checked.baseUrl), key.trim());
    await this.context.globalState.update(configKey, checked);
  }
  async forgetKey() {
    await this.context.secrets.delete(this.keyId(this.config().baseUrl));
  }
}
