import { describe, expect, it } from 'vitest';
import { tokenDifference } from '../../src/domain/checkers/token-checker';
describe('token checker', () => {
  it('ignores whitespace but preserves case and numeric spelling', () => {
    expect(tokenDifference(' 1  2\n', '1\n2')).toBeUndefined();
    expect(tokenDifference('', '\n')).toBeUndefined();
    expect(tokenDifference('YES', 'yes')?.token).toBe(1);
    expect(tokenDifference('1', '1.0')?.token).toBe(1);
  });
  it('identifies missing, extra and changed tokens', () => {
    expect(tokenDifference('a b', 'a')).toEqual({ token: 2, expected: 'b', actual: undefined });
    expect(tokenDifference('a', 'a b')).toEqual({ token: 2, expected: undefined, actual: 'b' });
    expect(tokenDifference('1 2 3', '1 9 3')).toEqual({ token: 2, expected: '2', actual: '9' });
  });
});
