import {
  assistantReadySchema,
  assistantCopySchema,
  assistantRequestSchema,
  type AssistantHostMessage,
} from './ai-assistance';
import { languageIds } from '../domain/models';
import { z } from 'zod';
import type { Problem, RunResult, TestCase, TestResult } from '../domain/models';
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
export const problemTargetSchema = z.object({
  id,
  language: z.enum(languageIds),
  contestId: z.number().int().positive().optional(),
  collection: z.literal('standalone').optional(),
});
export interface AccountState {
  status: 'checking' | 'signedIn' | 'signedOut';
  handle?: string;
  error?: string;
}
export const requestSchema = z.discriminatedUnion('type', [
  assistantRequestSchema,
  assistantReadySchema,
  assistantCopySchema,
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('draftState'), dirty: z.boolean() }),
  z.object({
    type: z.literal('saveTest'),
    test: z.object({
      id,
      input: z.string().max(1_000_000),
      expected: z.string().max(1_000_000).optional(),
    }),
  }),
  z.object({ type: z.literal('deleteTest'), testId: id }),
  z.object({ type: z.literal('run'), testId: id.optional(), target: problemTargetSchema }),
  z.object({ type: z.literal('stop') }),
  z.object({ type: z.literal('switchLanguage') }),
  z.object({ type: z.literal('submitSource'), target: problemTargetSchema }),
  z.object({ type: z.literal('copySource'), target: problemTargetSchema }),
  z.object({ type: z.literal('openLogin') }).strict(),
]);
export type WebviewRequest = z.infer<typeof requestSchema>;
export type HostMessage =
  | AssistantHostMessage
  | { type: 'accountState'; account: AccountState }
  | { type: 'state'; problem: Problem; tests: TestCase[] }
  | { type: 'submitting'; submitting: boolean }
  | { type: 'running'; running: boolean; testId?: string }
  | { type: 'progress'; result: TestResult }
  | { type: 'result'; result: RunResult }
  | { type: 'error'; message: string };
