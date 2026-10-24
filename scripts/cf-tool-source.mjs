// Developer/CI only: both native client and transport come from the same pin.
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { root } from './downloader-common.mjs';

export const pin = JSON.parse(
  await fs.readFile(path.join(root, 'packaging', 'cf-tool.json'), 'utf8'),
);
if (!/^[a-f0-9]{40}$/.test(pin.revision)) throw new Error('CF Tool must be pinned to a commit.');
function git(args, cwd = root) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 300000, shell: false });
  if (r.error || r.status !== 0)
    throw new Error(`CF Tool source unavailable: ${r.error?.message ?? r.stderr}`);
  return r.stdout.trim();
}
export async function cfToolSource() {
  let source = process.env.ACSTRIDE_CF_TOOL_SOURCE;
  if (!source) {
    const build = path.join(root, '.build');
    await fs.mkdir(build, { recursive: true });
    source = path.join(build, `cf-tool-${pin.revision}`);
    try {
      await fs.access(path.join(source, '.git'));
    } catch {
      await fs.mkdir(source, { recursive: true });
      git(['init', source]);
      git(['remote', 'add', 'origin', pin.repository], source);
      git(['fetch', '--depth', '1', 'origin', pin.revision], source);
      git(['checkout', '--detach', 'FETCH_HEAD'], source);
    }
  }
  source = path.resolve(source);
  if (git(['rev-parse', 'HEAD'], source) !== pin.revision || git(['status', '--porcelain'], source))
    throw new Error('CF Tool source must be clean and match the pinned commit.');
  return source;
}
