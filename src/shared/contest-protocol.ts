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
  z.object({ type: z.literal('openSettings') }),
  z
    .object({
      type: z.literal('contestSection'),
      section: z.enum(['prepare', 'submissions', 'rankings']),
    })
    .strict(),
  z.object({ type: z.literal('switchLanguage') }),
  z.object({ type: z.literal('selectContest'), contestId: contestIdSchema }),
  z.object({ type: z.literal('refreshStatus'), contestId: contestIdSchema }),
  z.object({ type: z.literal('refreshStandings'), contestId: contestIdSchema }),
  z.object({
    type: z.literal('openProblem'),
    contestId: contestIdSchema,
    index: problemIndexSchema,
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
  section?: 'prepare' | 'submissions' | 'rankings';
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
  refreshNotice?: string;
  serverNow: number;
  defaultLanguage?: Language;
}
export type ContestHostMessage =
  | { type: 'contestState'; state: ContestViewState }
  | {
      type: 'statement';
      contestId: number;
      index: string;
      statement: Statement;
      problems: { index: string; name: string }[];
      language: Language;
    };
