import type { Difference } from '../models';
export function tokenDifference(expected: string, actual: string): Difference | undefined {
  const tokens = (s: string) => (s.trim() ? s.trim().split(/\s+/u) : []);
  const a = tokens(expected),
    b = tokens(actual);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return { token: i + 1, expected: a[i], actual: b[i] };
  }
  return undefined;
}
