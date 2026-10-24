import { promises as fs } from 'node:fs';
import path from 'node:path';

// Launch the official Windows distribution through Java, avoiding cmd.exe and shell quoting.
export async function kotlinCompiler(
  command: string,
  args: string[],
  runtime = 'java',
  platform = process.platform,
  searchPath = process.env.PATH || '',
) {
  if (platform !== 'win32') return { command, args };
  const names = /\.(exe|bat|cmd)$/i.test(command)
    ? [command]
    : [`${command}.exe`, `${command}.bat`, `${command}.cmd`, command];
  const candidates =
    path.isAbsolute(command) || /[/\\]/.test(command)
      ? names
      : searchPath
          .split(path.delimiter)
          .filter(Boolean)
          .flatMap((dir) => names.map((name) => path.join(dir.replace(/^"|"$/g, ''), name)));
  let found: string | undefined;
  for (const candidate of candidates) {
    try {
      if ((await fs.stat(candidate)).isFile()) {
        found = candidate;
        break;
      }
    } catch {
      /* Try next PATH entry. */
    }
  }
  if (!found || !/\.(bat|cmd)$/i.test(found)) return { command: found || command, args };
  const home = path.resolve(path.dirname(found), '..');
  const preloader = path.join(home, 'lib', 'kotlin-preloader.jar');
  const compiler = path.join(home, 'lib', 'kotlin-compiler.jar');
  await fs.access(preloader);
  await fs.access(compiler);
  const javaArgs: string[] = [];
  const compilerArgs: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('-J')) javaArgs.push(arg.slice(2));
    else if (arg.startsWith('-D')) javaArgs.push(arg);
    else compilerArgs.push(arg);
  }
  return {
    command: runtime,
    args: [
      '-Xmx512M',
      '-Xms128M',
      ...javaArgs,
      `-Dkotlin.home=${home}`,
      '--add-opens',
      'java.base/java.util=ALL-UNNAMED',
      '-cp',
      preloader,
      'org.jetbrains.kotlin.preloading.Preloader',
      '-cp',
      compiler,
      'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      ...compilerArgs,
    ],
  };
}
