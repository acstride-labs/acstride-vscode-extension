import { assistantOptionsSchema, type AssistantOptions } from './ai-assistance';
import { languageIds } from '../domain/models';
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
    defaultLanguage: z.enum(languageIds).default('cpp'),
    handle: z.string().regex(/^(?:[A-Za-z0-9_.-]{1,64})?$/),
    compiler: z.string().trim().min(1).max(4096),
    cppArgs: args,
    cppTemplate: z.string().max(4096),
    cppTemplateCode: z.string().max(1_000_000).default(''),
    interpreter: z.string().trim().min(1).max(4096),
    pythonArgs: args,
    pythonTemplate: z.string().max(4096),
    pythonTemplateCode: z.string().max(1_000_000).default(''),
    javaCompiler: z.string().trim().min(1).max(4096).default('javac'),
    javaArgs: args.default([]),
    javaRuntime: z.string().trim().min(1).max(4096).default('java'),
    javaRuntimeArgs: args.default([]),
    javaTemplate: z.string().max(4096).default(''),
    javaTemplateCode: z.string().max(1_000_000).default(''),
    kotlinCompiler: z.string().trim().min(1).max(4096).default('kotlinc'),
    kotlinArgs: args.default([]),
    kotlinRuntime: z.string().trim().min(1).max(4096).default('java'),
    kotlinRuntimeArgs: args.default([]),
    kotlinTemplate: z.string().max(4096).default(''),
    kotlinTemplateCode: z.string().max(1_000_000).default(''),
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
  javaCompiler: 'java.compiler',
  javaArgs: 'java.args',
  javaRuntime: 'java.runtime',
  javaRuntimeArgs: 'java.runtimeArgs',
  javaTemplate: 'java.templatePath',
  javaTemplateCode: 'java.templateCode',
  kotlinCompiler: 'kotlin.compiler',
  kotlinArgs: 'kotlin.args',
  kotlinRuntime: 'kotlin.runtime',
  kotlinRuntimeArgs: 'kotlin.runtimeArgs',
  kotlinTemplate: 'kotlin.templatePath',
  kotlinTemplateCode: 'kotlin.templateCode',
  timeoutMs: 'run.timeoutMs',
} as const;
export const settingsRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('saveAssistanceSettings'), options: assistantOptionsSchema }).strict(),
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
  z.object({ type: z.literal('checkEnvironment'), language: z.enum(languageIds) }),
  z.object({ type: z.literal('checkAllEnvironments') }).strict(),
]);
export interface EnvironmentResult {
  status: 'checking' | 'passed' | 'failed';
  command: string;
  message?: string;
}
export interface SettingsState {
  assistanceOptions: AssistantOptions;
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
  templatePreviews: Record<import('../domain/models').Language, string>;
  defaultTemplates: Record<import('../domain/models').Language, string>;
  templateWarnings: Partial<Record<import('../domain/models').Language, boolean>>;
  environments: Partial<Record<import('../domain/models').Language, EnvironmentResult>>;
  busy: boolean;
  notice?: string;
  error?: string;
}
