import { z } from 'zod';
import type { Problem, RunResult, TestCase, TestResult } from '../domain/models';
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
export const requestSchema = z.discriminatedUnion('type', [
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
  z.object({ type: z.literal('run'), testId: id.optional() }),
  z.object({ type: z.literal('stop') }),
  z.object({ type: z.literal('switchLanguage') }),
  z.object({ type: z.literal('submit') }),
]);
export type WebviewRequest = z.infer<typeof requestSchema>;
export type HostMessage =
  | { type: 'state'; problem: Problem; tests: TestCase[] }
  | { type: 'running'; running: boolean }
  | { type: 'progress'; result: TestResult }
  | { type: 'result'; result: RunResult }
  | { type: 'error'; message: string };
