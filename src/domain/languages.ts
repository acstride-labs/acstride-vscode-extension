import type { Language } from './models';

export const languages: Record<Language, { label: string; sourceFile: string; template: string }> =
  {
    cpp: { label: 'C++', sourceFile: 'main.cpp', template: 'default.cpp' },
    python: { label: 'Python 3', sourceFile: 'main.py', template: 'default.py' },
  };
