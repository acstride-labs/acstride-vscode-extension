import type * as vscode from 'vscode';
import {
  defaultTranslationOptions,
  translationOptionsSchema,
  type TranslationOptions,
  aiConfigSchema,
  type AiConfig,
} from '../shared/ai-protocol';
import { normalizeAiBaseUrl } from '../infrastructure/ai/client';
const configKey = 'cfide.aiConfig';
/** Credentials are bound to the configured endpoint, so editing Base URL never forwards an old key. */
export class AiSettings {
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
    return parsed.success ? parsed.data : { ...defaultTranslationOptions };
  }
  async saveTranslationOptions(options: TranslationOptions) {
    await this.context.globalState.update(
      'cfide.translationOptions',
      translationOptionsSchema.parse(options),
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
