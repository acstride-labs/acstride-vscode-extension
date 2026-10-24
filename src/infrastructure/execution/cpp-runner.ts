import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ProgramRunner } from '../../application/ports/program-runner';
import type { RunConfig, RunResult, TestCase, TestResult } from '../../domain/models';
import { runCases } from './run-cases';
import { executeProcess } from './process-executor';
import { platformCompilerArgs } from './cpp-toolchain';
export class CppRunner implements ProgramRunner {
  async run(
    source: string,
    tests: TestCase[],
    config: RunConfig,
    signal: AbortSignal,
    progress?: (result: TestResult) => void,
  ): Promise<RunResult> {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'codeforces-workbench-run-'));
    const result: RunResult = { runId: randomUUID(), results: [] };
    try {
      // Snapshot beside the build output; quoted local includes resolve against the source folder.
      const snapshot = path.join(folder, 'main.cpp');
      await fs.copyFile(source, snapshot);
      const binary = path.join(folder, process.platform === 'win32' ? 'main.exe' : 'main');
      const platformArgs = await platformCompilerArgs(config, signal);
      const compile = await executeProcess(
        config.command,
        [...platformArgs, ...config.args, '-iquote', path.dirname(source), snapshot, '-o', binary],
        { cwd: folder, timeoutMs: 30000, signal },
      );
      if (compile.reason === 'cancelled') return { ...result, cancelled: true };
      if (compile.code !== 0 || compile.reason)
        return {
          ...result,
          compileError:
            compile.stderr || compile.stdout || `Compilation stopped: ${compile.reason}`,
        };
      return {
        ...result,
        ...(await runCases(binary, [], tests, config, { cwd: folder, signal }, progress)),
      };
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  }
}
