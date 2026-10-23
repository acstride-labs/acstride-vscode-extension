import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ProgramRunner } from '../../application/ports/program-runner';
import type { RunConfig, RunResult, TestCase, TestResult } from '../../domain/models';
import { runCases } from './run-cases';

export class PythonRunner implements ProgramRunner {
  async run(
    source: string,
    tests: TestCase[],
    config: RunConfig,
    signal: AbortSignal,
    progress?: (result: TestResult) => void,
  ): Promise<RunResult> {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-python-'));
    try {
      const snapshot = path.join(folder, 'main.py');
      await fs.copyFile(source, snapshot);
      const env = {
        ...process.env,
        PYTHONPATH: [path.dirname(source), process.env.PYTHONPATH]
          .filter(Boolean)
          .join(path.delimiter),
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      };
      return {
        runId: randomUUID(),
        ...(await runCases(
          config.command,
          [...config.args, '-u', '-B', '-X', 'utf8', snapshot],
          tests,
          config,
          { cwd: folder, signal, env },
          progress,
        )),
      };
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  }
}
