import { z } from 'zod';

export const contestIdSchema = z.number().int().positive().max(999999999);
export const problemIndexSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/);
export const contestSchema = z.object({
  id: contestIdSchema,
  name: z.string(),
  phase: z.enum(['BEFORE', 'CODING', 'PENDING_SYSTEM_TEST', 'SYSTEM_TEST', 'FINISHED']),
  type: z.string().default('CF'),
  startTimeSeconds: z.number().optional(),
  durationSeconds: z.number(),
  frozen: z.boolean().optional(),
});
export const contestRecordSchema = z.object({
  schemaVersion: z.literal(1),
  contest: contestSchema,
  archived: z.boolean().default(false),
  defaultLanguage: z.enum(['cpp', 'python']).default('cpp'),
  problems: z
    .array(
      z.object({
        index: problemIndexSchema,
        name: z.string(),
        ready: z.boolean(),
        downloadAttempts: z.number().int().nonnegative().default(0),
        nextRetryAt: z.number().default(0),
        error: z.string().optional(),
      }),
    )
    .default([]),
  updatedAt: z.number(),
  error: z.string().optional(),
  nextRetryAt: z.number().default(0),
  retryCount: z.number().default(0),
});
export type Contest = z.infer<typeof contestSchema>;
export type ContestRecord = z.infer<typeof contestRecordSchema>;
export interface Statement {
  title: string;
  html: string;
  timeLimit: string;
  memoryLimit: string;
  fetchedAt: number;
  imageWarning?: string;
}
export interface CFSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  problem: { index: string };
  programmingLanguage: string;
  verdict?: string;
  testset?: string;
  passedTestCount?: number;
  timeConsumedMillis?: number;
  memoryConsumedBytes?: number;
}
export interface RankRow {
  rank: number;
  handles: string[];
  points: number;
  penalty: number;
  participantType: string;
  problemResults: { points: number; rejectedAttemptCount: number; type: string }[];
}
export interface Standings {
  contest: Contest;
  problems: { index: string; name: string }[];
  rows: RankRow[];
  fetchedAt: number;
}

export function parseContestId(input: string): number {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return contestIdSchema.parse(Number(trimmed));
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Enter a Codeforces contest ID or https://codeforces.com/contest/1234 URL.');
  }
  const match = /^\/contest\/(\d+)(?:\/|$)/.exec(url.pathname);
  if (
    url.protocol !== 'https:' ||
    !['codeforces.com', 'www.codeforces.com'].includes(url.hostname) ||
    !match
  )
    throw new Error(
      'This version supports regular Codeforces /contest/ URLs, not Gym or group contests.',
    );
  return contestIdSchema.parse(Number(match[1]));
}

export function submissionLabel(s: CFSubmission): string {
  if (!s.verdict || ['TESTING', 'SUBMITTED'].includes(s.verdict)) return 'Judging';
  if (s.verdict === 'OK')
    return s.testset === 'PRETESTS'
      ? 'Pretests passed'
      : s.testset === 'TESTS'
        ? 'Accepted'
        : `Passed ${s.testset ?? 'tests'}`;
  return s.verdict.replaceAll('_', ' ');
}

export const maxDownloadAttempts = 4;
