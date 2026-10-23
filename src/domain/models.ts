export interface Problem {
  id: string;
  title: string;
}
export interface TestCase {
  id: string;
  input: string;
  expected?: string;
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
  compiler: string;
  args: string[];
  timeoutMs: number;
}
