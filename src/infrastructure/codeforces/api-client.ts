import { z } from 'zod';
import {
  contestSchema,
  type CFSubmission,
  type Contest,
  type Standings,
} from '../../domain/contest';
import { RequestQueue } from './request-queue';

const submissionSchema = z.object({
  id: z.number(),
  contestId: z.number().optional(),
  creationTimeSeconds: z.number(),
  problem: z.object({ index: z.string() }),
  programmingLanguage: z.string(),
  verdict: z.string().optional(),
  testset: z.string().optional(),
  passedTestCount: z.number().optional(),
  timeConsumedMillis: z.number().optional(),
  memoryConsumedBytes: z.number().optional(),
});
const standingsSchema = z.object({
  contest: contestSchema,
  problems: z.array(z.object({ index: z.string(), name: z.string() })),
  rows: z.array(
    z.object({
      rank: z.number(),
      points: z.number(),
      penalty: z.number(),
      party: z.object({
        participantType: z.string(),
        members: z.array(z.object({ handle: z.string() })),
      }),
      problemResults: z.array(
        z.object({ points: z.number(), rejectedAttemptCount: z.number(), type: z.string() }),
      ),
    }),
  ),
});
export class CodeforcesApi {
  private contests?: { time: number; values: Contest[] };
  constructor(
    private queue: RequestQueue,
    private toolCall: (method: string, params: Record<string, string | number>) => Promise<unknown>,
  ) {}
  private call(method: string, params: Record<string, string | number>, priority = 10) {
    return this.queue.schedule(() => this.toolCall(method, params), priority);
  }
  async contest(id: number, force = false): Promise<Contest> {
    if (force || !this.contests || Date.now() - this.contests.time > 60000)
      this.contests = {
        time: Date.now(),
        values: z.array(contestSchema).parse(await this.call('contest.list', { gym: 'false' }, 15)),
      };
    const contest = this.contests.values.find((c) => c.id === id);
    if (!contest) throw new Error(`Contest ${id} was not found in public regular contests.`);
    return contest;
  }
  async submissions(id: number, handle: string): Promise<CFSubmission[]> {
    return z
      .array(submissionSchema)
      .parse(await this.call('contest.status', { contestId: id, handle, from: 1, count: 100 }, 0));
  }
  async standings(id: number): Promise<Standings> {
    // Public regular contests require the anonymous contestId-only request.
    const data = standingsSchema.parse(await this.call('contest.standings', { contestId: id }, 20));
    return {
      contest: data.contest,
      problems: data.problems,
      rows: data.rows.map((row) => ({
        rank: row.rank,
        handles: row.party.members.map((m) => m.handle),
        participantType: row.party.participantType,
        points: row.points,
        penalty: row.penalty,
        problemResults: row.problemResults,
      })),
      fetchedAt: Date.now(),
    };
  }
}
