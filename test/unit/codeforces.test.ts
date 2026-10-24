import { describe, expect, it } from 'vitest';
import { parseContestId, submissionLabel, problemAttemptState } from '../../src/domain/contest';
import { RequestQueue } from '../../src/infrastructure/codeforces/request-queue';
import { CodeforcesApi } from '../../src/infrastructure/codeforces/api-client';
import { fixtureContest } from '../fixtures/codeforces';

describe('Codeforces identities and statements', () => {
  it('accepts contest IDs and canonical regular contest URLs only', () => {
    expect(parseContestId(' 1234 ')).toBe(1234);
    expect(parseContestId('https://codeforces.com/contest/1234/problem/A')).toBe(1234);
    expect(parseContestId('https://www.codeforces.com/contest/1234')).toBe(1234);
    for (const value of [
      '0',
      '../1234',
      'https://evil.test/contest/1234',
      'http://codeforces.com/contest/1234',
      'https://codeforces.com/gym/1234',
      'https://codeforces.com/group/x/contest/1234',
    ])
      expect(() => parseContestId(value)).toThrow();
  });
  it('distinguishes pretests from final tests and missing verdicts', () => {
    const s = {
      id: 1,
      creationTimeSeconds: 1,
      problem: { index: 'A' },
      programmingLanguage: 'GNU C++',
    };
    expect(submissionLabel(s)).toBe('Judging');
    expect(submissionLabel({ ...s, verdict: 'OK', testset: 'PRETESTS' })).toBe('Pretests passed');
    expect(submissionLabel({ ...s, verdict: 'OK', testset: 'TESTS' })).toBe('Accepted');
  });
});

describe('Codeforces API and scheduling', () => {
  it('uses contestId-only standings and validates public API results', async () => {
    const calls: string[] = [],
      queue = new RequestQueue();
    const client = new CodeforcesApi(queue, async (method) => {
      calls.push(method);
      return method === 'contest.list'
        ? [fixtureContest]
        : {
            contest: fixtureContest,
            problems: [{ index: 'A', name: 'Sum' }],
            rows: [
              {
                rank: 2,
                points: 500,
                penalty: 0,
                party: { participantType: 'CONTESTANT', members: [{ handle: 'tester' }] },
                problemResults: [{ points: 500, rejectedAttemptCount: 1, type: 'PRELIMINARY' }],
              },
            ],
          };
    });
    expect((await client.contest(1234)).id).toBe(1234);
    await client.contest(1234);
    expect(calls).toEqual(['contest.list']);
    expect((await client.standings(1234)).rows[0].handles).toEqual(['tester']);
    queue.dispose();
  });
  it('preserves CLI errors and rejects incompatible operation results', async () => {
    const queue = new RequestQueue();
    const client = new CodeforcesApi(queue, async () => {
      throw new Error('rate_limited');
    });
    await expect(client.contest(1)).rejects.toThrow('rate_limited');
    const invalid = new CodeforcesApi(queue, async () => ({ invalid: true }));
    await expect(invalid.standings(1)).rejects.toThrow();
    queue.dispose();
  });
  it('serializes requests and prioritizes submissions over queued standings', async () => {
    const queue = new RequestQueue(),
      order: string[] = [];
    let release!: () => void;
    const first = queue.schedule(async () => {
      order.push('first');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const low = queue.schedule(async () => {
      order.push('standings');
    }, 20);
    const high = queue.schedule(async () => {
      order.push('submission');
    }, 0);
    release();
    await Promise.all([first, low, high]);
    expect(order).toEqual(['first', 'submission', 'standings']);
    queue.dispose();
    await expect(queue.schedule(async () => 1)).rejects.toThrow('closed');
  });
});

it('aggregates official problem attempts, retaining a pass despite a newer failed attempt', () => {
  const submission = (index: string, verdict?: string) => ({
    id: 1,
    creationTimeSeconds: 1,
    programmingLanguage: 'C++',
    problem: { index },
    verdict,
  });
  expect(problemAttemptState([], 'A')).toBe('untried');
  expect(problemAttemptState([submission('B', 'OK')], 'A')).toBe('untried');
  expect(problemAttemptState([submission('A', 'WRONG_ANSWER')], 'A')).toBe('attempted');
  expect(problemAttemptState([submission('A', 'TESTING')], 'A')).toBe('attempted');
  expect(problemAttemptState([submission('A', 'WRONG_ANSWER'), submission('A', 'OK')], 'A')).toBe(
    'passed',
  );
});
