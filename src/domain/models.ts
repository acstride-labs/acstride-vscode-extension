export type Language = 'cpp' | 'python';
export interface Problem {
  id: string;
  title: string;
  language: Language;
  contestId?: number;
  collection?: 'standalone';
  importedAt?: number;
}
export type ProblemTarget = Pick<Problem, 'id' | 'language' | 'contestId' | 'collection'>;
export interface TestCase {
  id: string;
  input: string;
  expected?: string;
  readOnly?: boolean;
}
export type Verdict = 'AC' | 'WA' | 'RE' | 'TLE' | 'OLE' | 'CE' | 'CANCELLED' | 'RAN';
export interface Difference {
  token: number;
  expected?: string;
  actual?: string;
}
export interface TestResult {
  testId: string;
  verdict: Verdict;
  stdout: string;
  stderr: string;
  durationMs: number;
  difference?: Difference;
}
export interface RunResult {
  runId: string;
  results: TestResult[];
  compileError?: string;
  cancelled?: boolean;
}
export interface RunConfig {
  command: string;
  args: string[];
  timeoutMs: number;
}
