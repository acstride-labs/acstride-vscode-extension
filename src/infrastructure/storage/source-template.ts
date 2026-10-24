import { promises as fs } from 'node:fs';

/** Inline configuration wins; existing file-based templates remain a fallback. */
export async function readSourceTemplate(options: {
  code?: string;
  file?: string;
  bundled: string;
}) {
  if (options.code?.trim()) return options.code;
  const file = options.file || options.bundled;
  const info = await fs.stat(file);
  if (info.size > 1_000_000) throw new Error('Template file exceeds 1 MB.');
  return fs.readFile(file, 'utf8');
}

export function instantiateTemplate(code: string, problemId: string) {
  return code.replaceAll('${PROBLEM_ID}', problemId);
}
