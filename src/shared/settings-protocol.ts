import { z } from 'zod';
import { locales, type Locale, type LocalePreference } from './i18n';
const args = z.array(z.string().max(10000)).max(100);
export const settingsValuesSchema = z
  .object({
    handle: z.string().regex(/^(?:[A-Za-z0-9_.-]{1,64})?$/),
    compiler: z.string().trim().min(1).max(4096),
    cppArgs: args,
    cppTemplate: z.string().max(4096),
    interpreter: z.string().trim().min(1).max(4096),
    pythonArgs: args,
    pythonTemplate: z.string().max(4096),
    timeoutMs: z.number().int().min(100).max(60000),
  })
  .strict();
export type SettingsValues = z.infer<typeof settingsValuesSchema>;
export const settingsKeys = {
  handle: 'codeforces.handle',
  compiler: 'cpp.compiler',
  cppArgs: 'cpp.args',
  cppTemplate: 'cpp.templatePath',
  interpreter: 'python.interpreter',
  pythonArgs: 'python.args',
  pythonTemplate: 'python.templatePath',
  timeoutMs: 'run.timeoutMs',
} as const;
export const settingsRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
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
]);
export interface SettingsState {
  locale: Locale;
  preference: LocalePreference;
  scope: 'user' | 'workspace';
  workspaceAvailable: boolean;
  trusted: boolean;
  values: SettingsValues;
  busy: boolean;
  notice?: string;
  error?: string;
}
