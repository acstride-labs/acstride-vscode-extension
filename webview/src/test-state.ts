import type { RunResult, TestCase, TestResult } from '../../src/domain/models';

// A run without expected output is not a pass or a failure.
export function resultTone(result?: TestResult) {
  return !result || result.verdict === 'RAN'
    ? 'neutral'
    : result.verdict === 'AC'
      ? 'pass'
      : 'fail';
}
export function retainResults(
  previous: TestCase[],
  next: TestCase[],
  results: Record<string, TestResult>,
) {
  return Object.fromEntries(
    next
      .filter((test) => {
        const old = previous.find((value) => value.id === test.id);
        return (
          old && old.input === test.input && old.expected === test.expected && results[test.id]
        );
      })
      .map((test) => [test.id, results[test.id]]),
  );
}

export function completeResults(
  previous: Record<string, TestResult>,
  runIds: string[],
  result: RunResult,
) {
  const next = {
    ...Object.fromEntries(Object.entries(previous).filter(([id]) => !runIds.includes(id))),
    ...Object.fromEntries(result.results.map((r) => [r.testId, r])),
  };
  for (const id of runIds)
    if (!next[id] && (result.compileError || result.cancelled)) {
      next[id] = {
        testId: id,
        verdict: result.compileError ? 'CE' : 'CANCELLED',
        durationMs: 0,
        stdout: '',
        stderr: '',
      };
    }
  return next;
}
