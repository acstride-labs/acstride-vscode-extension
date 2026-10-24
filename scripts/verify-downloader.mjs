import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bundle, executable, hostTarget, hashes, cleanEnvironment } from './downloader-common.mjs';

export async function verifyDownloader() {
  const pin = JSON.parse(
    await fs.readFile(new URL('../packaging/cf-tool.json', import.meta.url), 'utf8'),
  );
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(bundle, 'manifest.json'), 'utf8'));
  } catch {
    throw new Error(
      'Bundled downloader missing. Developers: run npm run build:downloader before packaging. End users never run Python/pip setup.',
    );
  }
  if (
    manifest.protocol !== 1 ||
    manifest.target !== hostTarget() ||
    manifest.revision !== pin.revision
  )
    throw new Error('Downloader target/protocol does not match this packaging host.');
  const actual = await hashes(path.join(bundle, 'cfide-downloader'));
  const notices = await hashes(path.join(bundle, 'notices'));
  const expected = Object.fromEntries(Object.entries(manifest.files));
  const files = Object.fromEntries([
    ...Object.entries(actual).map(([k, v]) => [`cfide-downloader/${k}`, v]),
    ...Object.entries(notices).map(([k, v]) => [`notices/${k}`, v]),
  ]);
  if (
    JSON.stringify(Object.entries(files).sort()) !== JSON.stringify(Object.entries(expected).sort())
  )
    throw new Error('Bundled downloader file hashes differ; rebuild before packaging.');
  // Empty PATH plus poisoned Python settings proves the executable is self-contained.
  const result = spawnSync(executable, ['--self-test'], {
    cwd: path.dirname(executable),
    encoding: 'utf8',
    timeout: 20000,
    env: {
      ...cleanEnvironment(),
      PATH: '',
      PYTHONHOME: '/does-not-exist/cfide',
      PYTHONPATH: '/does-not-exist/cfide',
      PYINSTALLER_RESET_ENVIRONMENT: '1',
    },
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Bundled downloader self-test failed: ${result.error?.message ?? result.stderr}`,
    );
  const health = JSON.parse(result.stdout);
  if (
    health.protocol !== 1 ||
    health.ready !== true ||
    health.embedded !== true ||
    health.caBundle !== true ||
    health.curlCffi !== '0.16.3'
  )
    throw new Error('Bundled downloader failed dependency/CA/isolation verification.');
  // Exercise the actual frozen persistent protocol without making any network request.
  const session = spawnSync(executable, ['--serve'], {
    cwd: path.dirname(executable),
    encoding: 'utf8',
    timeout: 20000,
    input: JSON.stringify({ path: '/invalid' }) + '\n' + JSON.stringify({ path: '/enter' }) + '\n',
    env: { ...cleanEnvironment(), PATH: '', PYINSTALLER_RESET_ENVIRONMENT: '1' },
  });
  if (session.error || session.status !== 0)
    throw new Error('Bundled downloader persistent startup failed.');
  const responses = session.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  if (responses.length !== 2 || responses.some((value) => value.error !== 'invalid_problem_path'))
    throw new Error('Bundled downloader persistent protocol mismatch.');
  console.log(
    `Verified ${manifest.target}: private Python + curl_cffi + CA bundle; system Python is not required.`,
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await verifyDownloader();
