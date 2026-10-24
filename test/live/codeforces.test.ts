import { describe, expect, it } from 'vitest';
import { CodeforcesApi } from '../../src/infrastructure/codeforces/api-client';
import {
  PublicProblemClient,
  downloaderExecutable,
} from '../../src/infrastructure/codeforces/public-problem-client';
import { ContestService } from '../../src/application/contest-service';
import { ContestRepository } from '../../src/infrastructure/storage/contest-repository';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RequestQueue } from '../../src/infrastructure/codeforces/request-queue';
import { parseStatement } from '../../src/infrastructure/codeforces/statement-parser';
import { CfToolClient, cfToolExecutable } from '../../src/infrastructure/codeforces/cf-tool-client';

// Explicitly opt in. These checks never log in, register, or submit code.
describe.skipIf(process.env.CFIDE_LIVE !== '1')('live read-only Codeforces smoke checks', () => {
  it('uses the actual bundled Go bridge for public metadata, submissions and standings', async () => {
    const queue = new RequestQueue(),
      tool = new CfToolClient(cfToolExecutable(path.resolve('.')));
    try {
      const api = new CodeforcesApi(queue, fetch, (method, params) => tool.call(method, params));
      expect((await api.contest(1)).id).toBe(1);
      expect((await api.submissions(1, 'tourist')).length).toBeGreaterThan(0);
      expect((await api.standings(1)).problems.some((p) => p.index === 'A')).toBe(true);
    } finally {
      tool.dispose();
      queue.dispose();
    }
  }, 90000);
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
    const client = new PublicProblemClient(queue, downloaderExecutable(path.resolve('.')));
    try {
      const page = await client.page('/contest/1/problem/A');
      const result = parseStatement(page.html, page.url);
      expect(result.statement.title).toContain('Theatre Square');
      expect(result.samples.length).toBeGreaterThan(0);
    } finally {
      client.dispose();
      queue.dispose();
    }
  }, 30000);
  it('imports real public samples into an isolated contest workspace without authentication', async () => {
    const queue = new RequestQueue();
    const client = new PublicProblemClient(queue, downloaderExecutable(path.resolve('.')));
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-public-live-'));
    try {
      const repo = new ContestRepository(root);
      const service = new ContestService(
        repo,
        new CodeforcesApi(queue),
        client,
        async () => 'print(0)',
      );
      await service.add(1, 'python');
      await service.sync(1, 'A');
      expect((await repo.get(1)).problems.find((p) => p.index === 'A')?.ready).toBe(true);
      expect((await repo.problems(1).listTests('A'))[0]).toMatchObject({
        input: '6 6 4\n',
        expected: '4\n',
        readOnly: true,
      });
      expect(await fs.readFile(repo.problems(1).sourcePath('A', 'python'), 'utf8')).toBe(
        'print(0)',
      );
      for (const pathname of ['/contest/1/problem/B', '/contest/2000/problem/A']) {
        const page = await client.page(pathname);
        expect(parseStatement(page.html, page.url).samples.length).toBeGreaterThan(0);
      }
      console.info(
        'Anonymous product transport: real contest import, Theatre Square sample 6 6 4 → 4, and two additional public statements passed.',
      );
    } finally {
      client.dispose();
      queue.dispose();
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 90000);
});
