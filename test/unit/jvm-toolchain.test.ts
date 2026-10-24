import { afterEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kotlinCompiler } from '../../src/infrastructure/execution/kotlin-toolchain';
import { matchesSubmissionLanguage } from '../../src/domain/languages';
import { languageRunConfig } from '../../src/infrastructure/execution/language-runner';
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })),
  );
});
it('keeps Java, JavaScript and Kotlin submission compilers separate', () => {
  expect(matchesSubmissionLanguage('java', 'Java 21 64bit')).toBe(true);
  expect(matchesSubmissionLanguage('java', 'JavaScript V8')).toBe(false);
  expect(matchesSubmissionLanguage('java', 'Kotlin 1.9')).toBe(false);
  expect(matchesSubmissionLanguage('kotlin', 'Kotlin 2.2')).toBe(true);
  expect(matchesSubmissionLanguage('kotlin', 'Java 17')).toBe(false);
  expect(matchesSubmissionLanguage('cpp', 'GNU G++23')).toBe(true);
  expect(matchesSubmissionLanguage('python', 'PyPy 3.10')).toBe(true);
});
it('keeps compiler arguments and runtime arguments independent', () => {
  const configured: Record<string, unknown> = {
    'java.compiler': '/jdk/bin/javac',
    'java.args': ['--release', '17'],
    'java.runtime': '/jdk/bin/java',
    'java.runtimeArgs': ['-Xmx256m'],
  };
  const config = languageRunConfig('java', {
    get: <T>(key: string, fallback: T) => (configured[key] ?? fallback) as T,
  });
  expect(config.command).toBe('/jdk/bin/javac');
  expect(config.args).toEqual(['--release', '17']);
  expect(config.runtimeCommand).toBe('/jdk/bin/java');
  expect(config.runtimeArgs).toEqual(['-Xmx256m']);
});
it('launches the official Windows Kotlin compiler without a command shell', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide kotlin & compiler '));
  folders.push(home);
  await fs.mkdir(path.join(home, 'bin'));
  await fs.mkdir(path.join(home, 'lib'));
  const command = path.join(home, 'bin', 'kotlinc.bat');
  await fs.writeFile(command, '');
  for (const name of ['kotlin-preloader.jar', 'kotlin-compiler.jar'])
    await fs.writeFile(path.join(home, 'lib', name), '');
  const result = await kotlinCompiler(
    command,
    ['-J-Xmx1g', '-Dexample=value', 'Main.kt', 'literal & value'],
    'custom-java',
    'win32',
  );
  expect(result.command).toBe('custom-java');
  expect(result.args).toContain('-Xmx1g');
  expect(result.args).toContain('-Dexample=value');
  expect(result.args.slice(-2)).toEqual(['Main.kt', 'literal & value']);
  expect(result.args).toContain(path.join(home, 'lib', 'kotlin-compiler.jar'));
  await fs.writeFile(path.join(home, 'bin', 'kotlinc'), '#!/bin/sh');
  const onPath = await kotlinCompiler(
    'kotlinc',
    ['-version'],
    'custom-java',
    'win32',
    path.join(home, 'bin'),
  );
  expect(onPath.command).toBe('custom-java');
  expect(onPath.args).toContain('org.jetbrains.kotlin.preloading.Preloader');
});
