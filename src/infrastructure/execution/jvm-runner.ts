import { kotlinCompiler } from './kotlin-toolchain';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ProgramRunner } from '../../application/ports/program-runner';
import type { RunConfig, RunResult, TestCase, TestResult } from '../../domain/models';
import { executeProcess } from './process-executor';
import { runCases } from './run-cases';

export class JvmRunner implements ProgramRunner {
  constructor(private readonly language: 'java' | 'kotlin') {}
  async run(
    source: string,
    tests: TestCase[],
    config: RunConfig,
    signal: AbortSignal,
    progress?: (result: TestResult) => void,
  ): Promise<RunResult> {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-jvm-'));
    const result: RunResult = { runId: randomUUID(), results: [] };
    try {
      const snapshot = path.join(folder, this.language === 'java' ? 'Main.java' : 'Main.kt');
      await fs.copyFile(source, snapshot);
      const jar = path.join(folder, 'main.jar');
      const args =
        this.language === 'java'
          ? [...config.args, '-encoding', 'UTF-8', '-d', folder, snapshot]
          : [...config.args, snapshot, '-include-runtime', '-d', jar];
      const compiler =
        this.language === 'kotlin'
          ? await kotlinCompiler(config.command, args, config.runtimeCommand)
          : { command: config.command, args };
      const compile = await executeProcess(compiler.command, compiler.args, {
        cwd: folder,
        timeoutMs: 60000,
        signal,
      });
      if (compile.reason === 'cancelled') return { ...result, cancelled: true };
      if (compile.code !== 0 || compile.reason)
        return {
          ...result,
          compileError:
            compile.stderr || compile.stdout || `Compilation stopped: ${compile.reason}`,
        };
      const launch = this.language === 'java' ? ['-cp', folder, 'Main'] : ['-jar', jar];
      return {
        ...result,
        ...(await runCases(
          config.runtimeCommand || 'java',
          [...(config.runtimeArgs || []), '-Dfile.encoding=UTF-8', ...launch],
          tests,
          config,
          { cwd: folder, signal },
          progress,
        )),
      };
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  }
}
