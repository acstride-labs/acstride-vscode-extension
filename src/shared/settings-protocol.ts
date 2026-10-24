import {
  translationOptionsSchema,
  aiCacheOptionsSchema,
  type AiCacheOptions,
  type TranslationOptions,
  aiConfigSchema,
  aiKeySchema,
  type AiState,
} from './ai-protocol';
import type { AccountState } from './protocol';
import { z } from 'zod';
import { locales, type Locale, type LocalePreference } from './i18n';
const args = z.array(z.string().max(10000)).max(100);
export const settingsValuesSchema = z
  .object({
    defaultLanguage: z.enum(['cpp', 'python']).default('cpp'),
    handle: z.string().regex(/^(?:[A-Za-z0-9_.-]{1,64})?$/),
    compiler: z.string().trim().min(1).max(4096),
    cppArgs: args,
    cppTemplate: z.string().max(4096),
    cppTemplateCode: z.string().max(1_000_000).default(''),
    interpreter: z.string().trim().min(1).max(4096),
    pythonArgs: args,
    pythonTemplate: z.string().max(4096),
    pythonTemplateCode: z.string().max(1_000_000).default(''),
    timeoutMs: z.number().int().min(100).max(60000),
  })
  .strict();
export type SettingsValues = z.infer<typeof settingsValuesSchema>;
export const settingsKeys = {
  defaultLanguage: 'solution.defaultLanguage',
  handle: 'codeforces.handle',
  compiler: 'cpp.compiler',
  cppArgs: 'cpp.args',
  cppTemplate: 'cpp.templatePath',
  cppTemplateCode: 'cpp.templateCode',
  interpreter: 'python.interpreter',
  pythonArgs: 'python.args',
  pythonTemplate: 'python.templatePath',
  pythonTemplateCode: 'python.templateCode',
  timeoutMs: 'run.timeoutMs',
} as const;
export const settingsRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('saveAiCacheSettings'), options: aiCacheOptionsSchema }).strict(),
  z
    .object({ type: z.literal('saveTranslationSettings'), options: translationOptionsSchema })
    .strict(),
  z
    .object({ type: z.literal('saveAI'), config: aiConfigSchema, apiKey: aiKeySchema.optional() })
    .strict(),
  z
    .object({ type: z.literal('testAI'), config: aiConfigSchema, apiKey: aiKeySchema.optional() })
    .strict(),
  z.object({ type: z.literal('forgetAIKey') }).strict(),
  z.object({ type: z.literal('signIn') }).strict(),
  z.object({ type: z.literal('signOut') }).strict(),
  z.object({ type: z.literal('refreshAccount') }).strict(),
  z.object({ type: z.literal('setLocale'), locale: z.enum(['auto', ...locales]) }).strict(),
  z.object({ type: z.literal('settingsScope'), scope: z.enum(['user', 'workspace']) }).strict(),
  z
    .object({
      type: z.literal('saveSettings'),
      scope: z.enum(['user', 'workspace']),
      values: settingsValuesSchema,
    })
    .strict(),
  z.object({ type: z.literal('checkEnvironment'), language: z.enum(['cpp', 'python']) }),
  z.object({ type: z.literal('checkAllEnvironments') }).strict(),
]);
export interface EnvironmentResult {
  status: 'checking' | 'passed' | 'failed';
  command: string;
  message?: string;
}
export interface SettingsState {
  ai: AiState;
  aiCacheOptions: AiCacheOptions;
  translationOptions: TranslationOptions;
  account: AccountState;
  locale: Locale;
  preference: LocalePreference;
  scope: 'user' | 'workspace';
  workspaceAvailable: boolean;
  trusted: boolean;
  values: SettingsValues;
  templatePreviews: { cpp: string; python: string };
  defaultTemplates: { cpp: string; python: string };
  templateWarnings: { cpp?: boolean; python?: boolean };
  environments: { cpp?: EnvironmentResult; python?: EnvironmentResult };
  busy: boolean;
  notice?: string;
  error?: string;
}
