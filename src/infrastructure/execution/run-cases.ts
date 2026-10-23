import type { RunConfig, TestCase, TestResult } from '../../domain/models';
import { tokenDifference } from '../../domain/checkers/token-checker';
import { executeProcess } from './process-executor';

export async function runCases(
  command: string,
  args: string[],
  tests: TestCase[],
  config: RunConfig,
  options: { cwd: string; signal: AbortSignal; env?: NodeJS.ProcessEnv },
  progress?: (result: TestResult) => void,
): Promise<{ results: TestResult[]; cancelled?: boolean }> {
  const results: TestResult[] = [];
  for (const test of tests) {
    if (options.signal.aborted) return { results, cancelled: true };
    const execution = await executeProcess(command, args, {
      ...options,
      input: test.input,
      timeoutMs: config.timeoutMs,
    });
    const difference =
      test.expected === undefined ? undefined : tokenDifference(test.expected, execution.stdout);
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
    const result: TestResult = {
      testId: test.id,
      verdict,
      stdout: execution.stdout,
      stderr: execution.stderr,
      durationMs: execution.durationMs,
      difference,
    };
    results.push(result);
    progress?.(result);
    if (verdict === 'CANCELLED') return { results, cancelled: true };
  }
  return { results };
}
