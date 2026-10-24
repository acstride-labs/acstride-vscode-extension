import type { Language, RunConfig } from '../../domain/models';
import { CppRunner } from './cpp-runner';
import { PythonRunner } from './python-runner';
import { JvmRunner } from './jvm-runner';
export function languageRunner(language: Language) {
  return language === 'cpp'
    ? new CppRunner()
    : language === 'python'
      ? new PythonRunner()
      : new JvmRunner(language);
}
export function languageRunConfig(
  language: Language,
  config: { get<T>(key: string, fallback: T): T },
): RunConfig {
  return {
    command: config.get(
      language === 'python' ? 'python.interpreter' : `${language}.compiler`,
      { cpp: 'g++', python: 'python3', java: 'javac', kotlin: 'kotlinc' }[language],
    ),
    args: config.get<string[]>(`${language}.args`, []),
    runtimeCommand: config.get(`${language}.runtime`, 'java'),
    runtimeArgs: config.get<string[]>(`${language}.runtimeArgs`, []),
    timeoutMs: config.get('run.timeoutMs', 2000),
  };
}
export const environmentProbe: Record<Language, string> = {
  cpp: '#include <iostream>\nint main(){std::cout << 5;}',
  python: 'print(5)\n',
  java: 'public class Main { public static void main(String[] args) { System.out.println(5); } }',
  kotlin: 'fun main() { println(5) }',
};
