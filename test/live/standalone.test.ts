import { expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ContestService } from '../../src/application/contest-service';
import { RunTests } from '../../src/application/run-tests';
import { ContestRepository } from '../../src/infrastructure/storage/contest-repository';
import { CfToolClient, cfToolExecutable } from '../../src/infrastructure/codeforces/cf-tool-client';
import { CodeforcesApi } from '../../src/infrastructure/codeforces/api-client';
import { RequestQueue } from '../../src/infrastructure/codeforces/request-queue';
import { PythonRunner } from '../../src/infrastructure/execution/python-runner';
// Public read-only smoke test: no credentials, registration or submission.
it.skipIf(process.env.CFIDE_LIVE !== '1')(
  'imports a real standalone problem through CF Tool and runs its official sample',
  async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acstride-single-live-'));
    const queue = new RequestQueue();
    const tool = new CfToolClient(cfToolExecutable(path.resolve('.')));
    try {
      const api = new CodeforcesApi(queue, (method, params) => tool.call(method, params));
      const repo = new ContestRepository(root, 'standalone');
      const source = "n = int(input())\nprint('YES' if n > 2 and n % 2 == 0 else 'NO')\n";
      const service = new ContestService(
        repo,
        api,
        { problem: (id, index, assets) => queue.schedule(() => tool.problem(id, index, assets)) },
        async () => source,
      );
      await service.addProblem(4, 'A', 'python');
      await service.ensureDownloaded(4, 'A');
      const record = await repo.get(4);
      expect(record.problems).toHaveLength(1);
      expect(record.problems[0]).toMatchObject({ index: 'A', ready: true });
      expect(record.problems[0].error).toBeUndefined();
      expect((await repo.statement(4, 'A'))?.title).toContain('Watermelon');
      expect(await new ContestRepository(root).list()).toEqual([]);
      const store = repo.problems(4);
      const result = await new RunTests(store, new PythonRunner()).execute(
        'A',
        { command: 'python3', args: [], timeoutMs: 2000 },
        new AbortController().signal,
      );
      expect(result.compileError).toBeUndefined();
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.every((r) => r.verdict === 'AC')).toBe(true);
    } finally {
      tool.dispose();
      queue.dispose();
      await fs.rm(root, { recursive: true, force: true });
    }
  },
  180000,
);
