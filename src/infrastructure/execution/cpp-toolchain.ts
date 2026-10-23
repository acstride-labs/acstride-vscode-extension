import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { executeProcess } from './process-executor';
import type { RunConfig } from '../../domain/models';

// Recent Apple CLT installations place libc++ headers in the SDK rather than
// beside clang. Resolve that SDK without changing global compiler settings.
export async function platformCompilerArgs(
  config: RunConfig,
  signal: AbortSignal,
): Promise<string[]> {
  if (
    process.platform !== 'darwin' ||
    config.args.some((a) => a === '-isysroot' || a.startsWith('--sysroot'))
  )
    return [];
  const version = await executeProcess(config.command, ['--version'], {
    cwd: os.tmpdir(),
    timeoutMs: 5000,
    signal,
  });
  if (!version.stdout.includes('Apple clang')) return [];
  const sdk = await executeProcess('/usr/bin/xcrun', ['--show-sdk-path'], {
    cwd: os.tmpdir(),
    timeoutMs: 5000,
    signal,
  });
  if (sdk.code !== 0 || sdk.reason) return [];
  const root = sdk.stdout.trim();
  const includes = path.join(root, 'usr', 'include', 'c++', 'v1');
  try {
    await fs.access(path.join(includes, 'iostream'));
  } catch {
    return ['-isysroot', root];
  }
  return ['-isysroot', root, '-isystem', includes];
}
