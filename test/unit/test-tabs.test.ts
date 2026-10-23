import { describe, it, expect } from 'vitest';
import { completeResults, retainResults, resultTone } from '../../webview/src/test-state';
import type { TestResult, Verdict } from '../../src/domain/models';

const result = (verdict: Verdict): TestResult => ({
  testId: 'a',
  verdict,
  stdout: '',
  stderr: '',
  durationMs: 1,
});
describe('test case tabs', () => {
  it('colors affected tabs on compile failure/cancellation without clearing unrelated results', () => {
    const old = { a: result('AC') };
    const compile = completeResults(old, ['b', 'c'], {
      runId: '1',
      results: [],
      compileError: 'bad source',
    });
    expect(compile.a.verdict).toBe('AC');
    expect(compile.b.verdict).toBe('CE');
    expect(compile.c.verdict).toBe('CE');
    expect(
      completeResults(old, ['a'], { runId: '1', results: [], compileError: 'bad source' }).a
        .verdict,
    ).toBe('CE');
    const cancelled = completeResults(old, ['b'], { runId: '2', results: [], cancelled: true });
    expect(cancelled.b.verdict).toBe('CANCELLED');
    expect(cancelled.a.verdict).toBe('AC');
    const single = completeResults(old, ['b'], {
      runId: '3',
      results: [{ ...result('WA'), testId: 'b' }],
    });
    expect(single.a.verdict).toBe('AC');
    expect(single.b.verdict).toBe('WA');
  });
  it('marks only verified passes green and every abnormal verdict red, with a neutral run-only state', () => {
    expect(resultTone(result('AC'))).toBe('pass');
    for (const verdict of ['WA', 'RE', 'TLE', 'OLE', 'CE', 'CANCELLED'] as const)
      expect(resultTone(result(verdict))).toBe('fail');
    expect(resultTone(result('RAN'))).toBe('neutral');
    expect(resultTone()).toBe('neutral');
  });
  it('preserves unrelated results on add/delete and invalidates edited cases', () => {
    const tests = [{ id: 'a', input: '1', expected: '2' }];
    const results = { a: result('AC') };
    expect(retainResults(tests, [...tests, { id: 'b', input: '' }], results)).toEqual(results);
    expect(retainResults(tests, [{ ...tests[0], expected: '3' }], results)).toEqual({});
    expect(retainResults(tests, [], results)).toEqual({});
  });
});
