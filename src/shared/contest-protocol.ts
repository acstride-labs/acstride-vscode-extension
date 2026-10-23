import { z } from 'zod';
import {
  contestIdSchema,
  problemIndexSchema,
  type ContestRecord,
  type CFSubmission,
  type RankRow,
  type Statement,
  type SubmissionAttempt,
} from '../domain/contest';
import type { Language } from '../domain/models';
export const contestRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('addContest') }),
  z.object({ type: z.literal('login') }),
  z.object({ type: z.literal('connectBrowser') }),
  z.object({ type: z.literal('logout') }),
  z.object({ type: z.literal('connectCookie') }),
  z.object({ type: z.literal('watchHandle') }),
  z.object({ type: z.literal('checkEnvironment'), language: z.enum(['cpp', 'python']) }),
  z.object({ type: z.literal('selectContest'), contestId: contestIdSchema }),
  z.object({
    type: z.literal('syncContest'),
    contestId: contestIdSchema,
    index: problemIndexSchema.optional(),
  }),
  z.object({ type: z.literal('refreshStatus'), contestId: contestIdSchema }),
  z.object({ type: z.literal('refreshStandings'), contestId: contestIdSchema }),
  z.object({
    type: z.literal('openProblem'),
    contestId: contestIdSchema,
    index: problemIndexSchema,
  }),
  z.object({ type: z.literal('archive'), contestId: contestIdSchema, archived: z.boolean() }),
  z.object({ type: z.literal('autoDownload'), contestId: contestIdSchema, enabled: z.boolean() }),
  z.object({
    type: z.literal('defaultLanguage'),
    contestId: contestIdSchema,
    language: z.enum(['cpp', 'python']),
  }),
  z.object({
    type: z.literal('rankFilter'),
    mode: z.enum(['all', 'nearby', 'search']),
    search: z.string().max(64),
  }),
  z.object({
    type: z.literal('resolveAttempt'),
    contestId: contestIdSchema,
    attemptId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('viewSnapshot'),
    contestId: contestIdSchema,
    attemptId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('registration'),
    contestId: contestIdSchema,
    register: z.boolean().default(false),
  }),
  z.object({ type: z.literal('announcements'), contestId: contestIdSchema }),
]);
export interface ContestViewState {
  contests: ContestRecord[];
  selectedId?: number;
  signedInHandle?: string;
  connectionMode: 'browser' | 'http';
  browserConnected: boolean;
  watchHandle?: string;
  submissions: CFSubmission[];
  submissionsUpdatedAt: number;
  attempts: SubmissionAttempt[];
  rows: RankRow[];
  rankProblemIndices: string[];
  rankingsUpdatedAt: number;
  rankTotal: number;
  rankMode: 'all' | 'nearby' | 'search';
  busy?: string;
  error?: string;
  registration?: string;
  announcements?: string;
  serverNow: number;
  defaultLanguage?: Language;
}
export type ContestHostMessage =
  | { type: 'contestState'; state: ContestViewState }
  | { type: 'statement'; contestId: number; index: string; statement: Statement };
