import type { Problem, TestCase } from '../../domain/models';
export interface WorkspaceStore {
  listProblems(): Promise<Problem[]>;
  createProblem(id: string, title: string, source: string): Promise<Problem>;
  sourcePath(id: string): string;
  listTests(id: string): Promise<TestCase[]>;
  saveTest(id: string, test: TestCase): Promise<void>;
  deleteTest(id: string, testId: string): Promise<void>;
}
