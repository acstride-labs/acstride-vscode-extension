import type { Language, Problem, TestCase } from '../../domain/models';
export interface WorkspaceStore {
  listProblems(): Promise<Problem[]>;
  createProblem(id: string, title: string, source: string, language?: Language): Promise<Problem>;
  sourcePath(id: string, language?: Language): string;
  listTests(id: string): Promise<TestCase[]>;
  saveTest(id: string, test: TestCase): Promise<void>;
  deleteTest(id: string, testId: string): Promise<void>;
}
