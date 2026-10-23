import { describe, expect, it } from 'vitest';
import { parseContestId, submissionLabel } from '../../src/domain/contest';
import { parseStatement } from '../../src/infrastructure/codeforces/statement-parser';
import { RequestQueue } from '../../src/infrastructure/codeforces/request-queue';
import { CodeforcesApi } from '../../src/infrastructure/codeforces/api-client';
import { statementHtml, fixtureContest } from '../fixtures/codeforces';

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
  it('extracts samples and preserves math while removing executable HTML', () => {
    const html = statementHtml().replace(
      '<p>Compute',
      '<script>alert(1)</script><img src="/image.png" onerror="alert(1)"><a href="javascript:alert(1)">unsafe</a><p>Compute',
    );
    const parsed = parseStatement(html, 'https://codeforces.com/contest/1234/problem/A');
    expect(parsed.samples).toEqual([{ id: 'sample-1', input: '2 3\n', expected: '5\n' }]);
    expect(parsed.statement.html).toContain('$$$a+b$$$');
    expect(parsed.statement.html).toContain('https://codeforces.com/image.png');
    expect(parsed.statement.html).not.toMatch(/<script|onerror|javascript:/);
  });
  it('preserves multiline modern sample divs, Unicode, empty output and line boundaries', () => {
    const html = statementHtml()
      .replace(
        '2 3<br>',
        '<div class="test-example-line">你好</div><div class="test-example-line">2 3</div>',
      )
      .replace('5<br>', '');
    expect(parseStatement(html, 'https://codeforces.com/contest/1/problem/A').samples[0]).toEqual({
      id: 'sample-1',
      input: '你好\n2 3\n',
      expected: '\n',
    });
  });
  it('rejects verification pages and incomplete sample pairs', () => {
    expect(() => parseStatement('<title>Just a moment</title>', 'https://codeforces.com')).toThrow(
      'statement',
    );
    expect(() =>
      parseStatement(
        statementHtml().replace('class="output"', 'class="missing"'),
        'https://codeforces.com',
      ),
    ).toThrow('counts differ');
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
    const urls: string[] = [],
      queue = new RequestQueue(0);
    const client = new CodeforcesApi(queue, (async (input) => {
      const url = String(input);
      urls.push(url);
      return Response.json({
        status: 'OK',
        result: url.includes('contest.list')
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
            },
      });
    }) as typeof fetch);
    expect((await client.contest(1234)).id).toBe(1234);
    await client.contest(1234);
    expect(urls).toHaveLength(1);
    expect((await client.standings(1234)).rows[0].handles).toEqual(['tester']);
    expect(new URL(urls[1]).search).toBe('?contestId=1234');
    queue.dispose();
  });
  it('does not retry failed network writes or fabricate API results', async () => {
    const queue = new RequestQueue(0);
    const client = new CodeforcesApi(queue, (async () =>
      Response.json({ status: 'FAILED', comment: 'Call limit exceeded' })) as typeof fetch);
    await expect(client.contest(1)).rejects.toThrow('Call limit exceeded');
    queue.dispose();
  });
  it('serializes requests and prioritizes submissions over queued standings', async () => {
    const queue = new RequestQueue(5),
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
