import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { root, hostTarget } from './downloader-common.mjs';

export async function verifyCodeforcesClient(
  folder = path.join(root, 'resources', 'codeforces-client'),
) {
  const pin = JSON.parse(
    await fs.readFile(path.join(root, 'packaging', 'codeforces-client.json'), 'utf8'),
  );
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'));
  const name = process.platform === 'win32' ? 'codeforces-client.exe' : 'codeforces-client';
  const expected = [name, 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'manifest.json'].sort();
  if (JSON.stringify((await fs.readdir(folder)).sort()) !== JSON.stringify(expected))
    throw new Error(
      'Codeforces Client bundle contains unexpected files. Rebuild from a clean bundle directory.',
    );
  if (
    manifest.protocol !== 1 ||
    manifest.target !== hostTarget() ||
    manifest.revision !== pin.revision
  )
    throw new Error('Codeforces Client bundle does not match the pinned source/platform.');
  for (const file of [name, 'LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
    const hash = createHash('sha256')
      .update(await fs.readFile(path.join(folder, file)))
      .digest('hex');
    if (hash !== manifest.files[file]) throw new Error(`Codeforces Client hash mismatch: ${file}`);
  }
  const result = spawnSync(
    path.join(folder, name),
    ['capabilities', '--request-id', 'verify-bundle'],
    {
      cwd: folder,
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 100000,
      env: { ...process.env, PATH: '' },
      shell: false,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error('Bundled Codeforces Client cannot start without Go on PATH.');
  const value = JSON.parse(result.stdout);
  if (
    value.protocol !== 1 ||
    value.requestId !== 'verify-bundle' ||
    !value.ok ||
    value.data.protocol !== 1 ||
    !['api', 'problem.read', 'contest.problems', 'download.stream'].every((op) =>
      value.data.anonymous.includes(op),
    )
  )
    throw new Error('Bundled Codeforces Client protocol mismatch.');
  console.log(
    `Verified Codeforces Client protocol, source pin, notices, hash and standalone startup (${hostTarget()}).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await verifyCodeforcesClient();
