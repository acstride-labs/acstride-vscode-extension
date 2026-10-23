import type { RunConfig, RunResult, TestCase, TestResult } from '../../domain/models';
export interface ProgramRunner {
  run(
    source: string,
    tests: TestCase[],
    config: RunConfig,
    signal: AbortSignal,
    progress?: (result: TestResult) => void,
  ): Promise<RunResult>;
}
