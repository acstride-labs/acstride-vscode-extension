import { z } from 'zod';
import {
  contestIdSchema,
  problemIndexSchema,
  type ContestRecord,
  type CFSubmission,
  type RankRow,
  type Statement,
} from '../domain/contest';
import type { Language } from '../domain/models';
export const contestRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('addContest') }),
  z.object({ type: z.literal('setupDownloads') }),
  z.object({ type: z.literal('watchHandle') }),
  z.object({
    type: z.literal('importHtml'),
    contestId: contestIdSchema,
    index: problemIndexSchema,
  }),
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
]);
export interface ContestViewState {
  contests: ContestRecord[];
  selectedId?: number;
  downloaderReady: boolean;
  watchHandle?: string;
  submissions: CFSubmission[];
  submissionsUpdatedAt: number;
  rows: RankRow[];
  rankProblemIndices: string[];
  rankingsUpdatedAt: number;
  rankTotal: number;
  rankMode: 'all' | 'nearby' | 'search';
  busy?: string;
  error?: string;
  serverNow: number;
  defaultLanguage?: Language;
}
export type ContestHostMessage =
  | { type: 'contestState'; state: ContestViewState }
  | { type: 'statement'; contestId: number; index: string; statement: Statement };
