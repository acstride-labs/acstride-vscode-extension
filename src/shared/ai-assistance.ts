import { z } from 'zod';
import { languageIds, type Language } from '../domain/models';
import { languages } from '../domain/languages';
import { translationLanguages, type TranslationLanguage } from './ai-protocol';

export const assistantKinds = ['hint', 'debug', 'coding'] as const;
export type AssistantKind = (typeof assistantKinds)[number];
export const previousHintPrompt =
  'You are a competitive programming tutor. Read the original English statement and give exactly {{hintCount}} progressively more specific hints in {{language}}. Start with a gentle observation, then explain the key idea, and finish with an actionable algorithmic direction. Do not give complete source code. The selected programming language is {{programmingLanguage}}.';
export const previousAssistantPrompts: Partial<Record<AssistantKind, string>> = {
  hint: previousHintPrompt,
  debug:
    "Review the provided original English problem statement and the user's current {{programmingLanguage}} source code. Respond in {{language}}. Identify concrete bugs, incorrect assumptions, edge cases and complexity issues. Explain why each issue matters and provide small counterexamples when justified. Only identify and explain problems; never provide a complete corrected solution or replacement code. If no definite bug is found, state that clearly and distinguish suspicions from verified facts.",
  coding:
    'Solve the problem described by the original English statement. Produce a complete reference solution in {{programmingLanguage}}, respecting all input/output constraints. Use class Main for Java and a top-level main() for Kotlin. Return only source code, without Markdown fences or prose. Any code comments should be in {{language}}.',
};
export const defaultAssistantPrompts: Record<AssistantKind, string> = {
  hint: 'You are a competitive programming tutor. Read the problem statement and give exactly {{hintCount}} progressively more specific hints in {{language}}. Start with a gentle observation, then explain the key idea, and finish with an actionable algorithmic direction. Do not give complete source code.',
  debug:
    "Review the provided problem statement and the user's current {{programmingLanguage}} source code. Respond in {{language}}. Identify concrete bugs, incorrect assumptions, edge cases and complexity issues. Explain why each issue matters and provide small counterexamples when justified. Only identify and explain problems; never provide a complete corrected solution or replacement code. If no definite bug is found, state that clearly and distinguish suspicions from verified facts.",
  coding:
    'Solve the problem described by the problem statement. Produce a complete reference solution in {{programmingLanguage}}, respecting all input/output constraints. Use class Main for Java and a top-level main() for Kotlin. Return only source code, without Markdown fences or prose. Any code comments should be in {{language}}.',
};
export const assistantToolOptionsSchema = z
  .object({
    show: z.boolean(),
    prompt: z.string().trim().min(1).max(20000),
    targetLanguage: z.enum(
      Object.keys(translationLanguages) as [TranslationLanguage, ...TranslationLanguage[]],
    ),
    hintCount: z.number().int().min(1).max(10),
  })
  .strict();
export type AssistantToolOptions = z.infer<typeof assistantToolOptionsSchema>;
export const assistantOptionsSchema = z
  .object({
    hint: assistantToolOptionsSchema,
    debug: assistantToolOptionsSchema,
    coding: assistantToolOptionsSchema,
  })
  .strict();
export type AssistantOptions = z.infer<typeof assistantOptionsSchema>;
export function defaultAssistantOptions(
  targetLanguage: TranslationLanguage = 'zh-CN',
): AssistantOptions {
  return Object.fromEntries(
    assistantKinds.map((kind) => [
      kind,
      { show: true, prompt: defaultAssistantPrompts[kind], targetLanguage, hintCount: 3 },
    ]),
  ) as AssistantOptions;
}
export function renderAssistantPrompt(options: AssistantToolOptions, language: Language) {
  const values: Record<string, string> = {
    language: translationLanguages[options.targetLanguage],
    programmingLanguage: languages[language].label,
    hintCount: String(options.hintCount),
  };
  return options.prompt.replace(
    /\{\{(language|programmingLanguage|hintCount)\}\}/g,
    (_, name: string) => values[name],
  );
}
export const assistantTargetSchema = z
  .object({
    contestId: z.number().int().positive().max(999999999),
    index: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/),
    collection: z.enum(['contest', 'standalone']).default('contest'),
    language: z.enum(languageIds),
  })
  .strict();
export type AssistantTarget = z.infer<typeof assistantTargetSchema>;
export const assistantRequestSchema = z
  .object({
    type: z.literal('aiAssist'),
    requestId: z.string().min(1).max(128),
    kind: z.enum(assistantKinds),
    target: assistantTargetSchema,
  })
  .strict();
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export interface AssistantResult {
  text?: string;
  hints?: string[];
}
export const assistantReadySchema = z.object({ type: z.literal('assistantReady') }).strict();
export const assistantCopySchema = z
  .object({
    type: z.literal('copyAiCode'),
    requestId: z.string().min(1).max(128),
    text: z.string().max(1000000),
  })
  .strict();
export type AssistantHostMessage =
  | { type: 'assistantCopied'; requestId: string }
  | { type: 'assistantOptions'; options: AssistantOptions }
  | {
      type: 'assistantResult';
      requestId: string;
      status: 'pending' | 'ready' | 'failed';
      result?: AssistantResult;
      error?: string;
    };
