import { describe, expect, it } from 'vitest';
import { CodeforcesApi } from '../../src/infrastructure/codeforces/api-client';
import { ContestService } from '../../src/application/contest-service';
import { ContestRepository } from '../../src/infrastructure/storage/contest-repository';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RequestQueue } from '../../src/infrastructure/codeforces/request-queue';
import { CodeforcesClientClient, codeforcesClientExecutable } from '../../src/infrastructure/codeforces/codeforces-client';

// Real product route only. Never authenticates, registers or submits.
describe.skipIf(process.env.CODEFORCES_WORKBENCH_LIVE !== '1')('live Codeforces Client client integration', () => {
  it('reads metadata, submissions, standings and imports real statements/samples through the bundled CLI', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acstride-client-live-'));
    const queue = new RequestQueue();
    const tool = new CodeforcesClientClient(codeforcesClientExecutable(path.resolve('.')));
    try {
      const api = new CodeforcesApi(queue, (method, params) => tool.call(method, params));
      expect((await api.contest(1)).id).toBe(1);
      expect((await api.submissions(1, 'tourist')).length).toBeGreaterThan(0);
      const repo = new ContestRepository(root);
      const service = new ContestService(
        repo,
        api,
        {
          problem: (id, index, assets) => queue.schedule(() => tool.problem(id, index, assets)),
        },
        async () => 'print(0)',
      );
      await service.add(1, 'python');
      await service.sync(1, 'A');
      const record = await repo.get(1);
      expect(record.problems.find((p) => p.index === 'A')?.error).toBeUndefined();
      expect(record.problems.find((p) => p.index === 'A')?.ready).toBe(true);
      expect((await repo.problems(1).listTests('A'))[0]).toMatchObject({
        input: '6 6 4\n',
        expected: '4\n',
        readOnly: true,
      });
      expect((await repo.statement(1, 'A'))?.title).toContain('Theatre Square');
      for (const [id, index] of [
        [1, 'B'],
        [2000, 'A'],
      ] as const) {
        expect((await tool.problem(id, index, repo.assets(id))).samples.length).toBeGreaterThan(0);
      }
    } finally {
      tool.dispose();
      queue.dispose();
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 180000);
});
