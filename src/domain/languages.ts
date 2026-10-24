import type { Language } from './models';

export const languages: Record<Language, { label: string; sourceFile: string; template: string }> =
  {
    cpp: { label: 'C++', sourceFile: 'main.cpp', template: 'default.cpp' },
    python: { label: 'Python 3', sourceFile: 'main.py', template: 'default.py' },
    java: { label: 'Java', sourceFile: 'Main.java', template: 'default.java' },
    kotlin: { label: 'Kotlin', sourceFile: 'Main.kt', template: 'default.kt' },
  };

export function matchesSubmissionLanguage(language: Language, name: string): boolean {
  return { cpp: /(?:c|g)\+\+/i, python: /python|pypy/i, java: /\bjava\b/i, kotlin: /\bkotlin\b/i }[
    language
  ].test(name);
}
