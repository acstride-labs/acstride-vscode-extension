import type { WorkspaceStore } from './ports/workspace-store';
import type { ProgramRunner } from './ports/program-runner';
import type { RunConfig, TestResult } from '../domain/models';
export class RunTests {
  constructor(
    private store: WorkspaceStore,
    private runner: ProgramRunner,
  ) {}
  async execute(
    problemId: string,
    config: RunConfig,
    signal: AbortSignal,
    progress?: (r: TestResult) => void,
    testId?: string,
  ) {
    const tests = (await this.store.listTests(problemId)).filter((t) => !testId || t.id === testId);
    if (!tests.length) throw new Error('Add at least one test before running.');
    return this.runner.run(this.store.sourcePath(problemId), tests, config, signal, progress);
  }
}
