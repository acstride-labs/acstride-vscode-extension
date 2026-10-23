import { describe, expect, it } from 'vitest';
import { CodeforcesApi } from '../../src/infrastructure/codeforces/api-client';
import { CodeforcesSession } from '../../src/infrastructure/codeforces/session-client';
import { RequestQueue } from '../../src/infrastructure/codeforces/request-queue';
import { parseStatement } from '../../src/infrastructure/codeforces/statement-parser';

// Explicitly opt in. These checks never log in, register, or submit code.
describe.skipIf(process.env.CFIDE_LIVE !== '1')('live read-only Codeforces smoke checks', () => {
  it('loads a public contest and standings from the live API', async () => {
    const queue = new RequestQueue();
    try {
      const api = new CodeforcesApi(queue);
      expect((await api.contest(1)).id).toBe(1);
      expect((await api.standings(1)).problems.some((p) => p.index === 'A')).toBe(true);
    } finally {
      queue.dispose();
    }
  }, 60000);
  it('loads and parses a real public problem statement without authentication', async () => {
    const queue = new RequestQueue();
    const secrets = { get: async () => undefined, store: async () => {}, delete: async () => {} };
    try {
      const session = new CodeforcesSession(secrets, queue);
      const page = await session.page('/contest/1/problem/A');
      const result = parseStatement(page.html, page.url);
      expect(result.statement.title).toContain('Theatre Square');
      expect(result.samples.length).toBeGreaterThan(0);
    } finally {
      queue.dispose();
    }
  }, 30000);
});
