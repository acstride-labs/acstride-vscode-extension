import { sanitizeStatement } from '../codeforces/statement-sanitizer';
/** Translation rendering remains separate from the general AI response cache. */
export function sanitizeTranslation(output: string, source: string) {
  const assets = [...source.matchAll(/cfide-asset:([a-f0-9]{64}\.(?:png|jpg|webp|gif))/g)].map(
    (m) => m[1],
  );
  const html = sanitizeStatement(
    output
      .replace(/^```(?:html)?\s*/, '')
      .replace(/\s*```$/, '')
      .replaceAll('cfide-asset:', 'acstride-asset:'),
    assets,
  );
  if (!html.trim()) throw new Error('AI service returned no translation.');
  return html;
}
