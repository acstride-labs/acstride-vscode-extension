import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ProgramRunner } from '../../application/ports/program-runner';
import type { RunConfig, RunResult, TestCase, TestResult } from '../../domain/models';
import { tokenDifference } from '../../domain/checkers/token-checker';
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
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-run-'));
    const result: RunResult = { runId: randomUUID(), results: [] };
    try {
      // Snapshot beside the build output; quoted local includes resolve against the source folder.
      const snapshot = path.join(folder, 'main.cpp');
      await fs.copyFile(source, snapshot);
      const binary = path.join(folder, process.platform === 'win32' ? 'main.exe' : 'main');
      const platformArgs = await platformCompilerArgs(config, signal);
      const compile = await executeProcess(
        config.compiler,
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
      for (const test of tests) {
        if (signal.aborted) {
          result.cancelled = true;
          break;
        }
        const execution = await executeProcess(binary, [], {
          cwd: folder,
          input: test.input,
          timeoutMs: config.timeoutMs,
          signal,
        });
        const difference =
          test.expected === undefined
            ? undefined
            : tokenDifference(test.expected, execution.stdout);
        const verdict =
          execution.reason === 'cancelled'
            ? 'CANCELLED'
            : execution.reason === 'timeout'
              ? 'TLE'
              : execution.reason === 'output'
                ? 'OLE'
                : execution.code !== 0
                  ? 'RE'
                  : test.expected === undefined
                    ? 'RAN'
                    : difference
                      ? 'WA'
                      : 'AC';
        const item: TestResult = {
          testId: test.id,
          verdict,
          stdout: execution.stdout,
          stderr: execution.stderr,
          durationMs: execution.durationMs,
          difference,
        };
        result.results.push(item);
        progress?.(item);
        if (verdict === 'CANCELLED') {
          result.cancelled = true;
          break;
        }
      }
      return result;
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  }
}
