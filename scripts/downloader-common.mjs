import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const bundle = path.join(root, 'resources', 'downloader');
export const executable = path.join(
  bundle,
  'cfide-downloader',
  process.platform === 'win32' ? 'cfide-downloader.exe' : 'cfide-downloader',
);
export function hostTarget() {
  const target = `${process.platform}-${process.arch}`;
  if (!['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'].includes(target))
    throw new Error(`No bundled downloader build is supported for ${target} yet.`);
  return target;
}
export function cleanEnvironment(source = process.env) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) =>
        !/^(PYTHON|PYINSTALLER_|_PYI_|IMPERSONATE_|CONDA|VIRTUAL_ENV|LD_|DYLD_)/i.test(key) &&
        !/^(SSL_CERT_FILE|SSL_CERT_DIR|REQUESTS_CA_BUNDLE|CURL_CA_BUNDLE)$/i.test(key),
    ),
  );
}
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: cleanEnvironment(),
      stdio: 'inherit',
      shell: false,
      ...options,
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with ${code}`)),
    );
  });
}
export async function hashes(folder, prefix = '') {
  const result = {};
  for (const entry of await fs.readdir(path.join(folder, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    // PyInstaller uses framework symlinks on macOS. VSIX contains dereferenced files.
    const info = await fs.stat(path.join(folder, relative));
    if (info.isDirectory()) Object.assign(result, await hashes(folder, relative));
    else if (info.isFile())
      result[relative] = createHash('sha256')
        .update(await fs.readFile(path.join(folder, relative)))
        .digest('hex');
  }
  return result;
}
