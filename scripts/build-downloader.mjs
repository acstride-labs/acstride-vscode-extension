import { promises as fs } from 'node:fs';
import path from 'node:path';
import { root, bundle, hostTarget, run, hashes, cleanEnvironment } from './downloader-common.mjs';

import { pin, cfToolSource } from './cf-tool-source.mjs';
const source = await cfToolSource();
const target = hostTarget();
const build = path.join(root, '.build', 'downloader');
const venv = path.join(build, 'venv');
const python = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
await fs.mkdir(build, { recursive: true });
await run(process.env.CFIDE_BUILD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [
  '-m',
  'venv',
  venv,
]);
await run(python, [
  '-m',
  'pip',
  'install',
  '--disable-pip-version-check',
  '--only-binary=:all:',
  '-r',
  path.join(source, 'packaging', 'downloader-requirements.txt'),
]);
await run(
  python,
  [
    '-m',
    'PyInstaller',
    '--noconfirm',
    '--onedir',
    '--noupx',
    '--name',
    'cfide-downloader',
    '--collect-all',
    'curl_cffi',
    '--collect-all',
    'certifi',
    '--exclude-module',
    'tkinter',
    '--exclude-module',
    'setuptools',
    '--distpath',
    path.join(build, 'output'),
    '--workpath',
    path.join(build, 'work'),
    '--specpath',
    build,
    path.join(source, 'packaging', 'public-fetch.py'),
  ],
  {
    env: { ...cleanEnvironment(), PYINSTALLER_CONFIG_DIR: path.join(build, 'cache') },
  },
);
// Only replace this generated bundle, never a user workspace or Python installation.
await fs.rm(bundle, { recursive: true, force: true });
await fs.mkdir(bundle, { recursive: true });
await fs.cp(path.join(build, 'output', 'cfide-downloader'), path.join(bundle, 'cfide-downloader'), {
  recursive: true,
  dereference: true,
});
await run(python, [
  path.join(source, 'packaging', 'collect-notices.py'),
  path.join(bundle, 'notices'),
]);
await fs.writeFile(
  path.join(bundle, 'manifest.json'),
  JSON.stringify(
    {
      protocol: 1,
      revision: pin.revision,
      target,
      python: 'private frozen runtime',
      files: await hashes(bundle),
    },
    null,
    2,
  ),
);
await run(process.execPath, [path.join(root, 'scripts', 'verify-downloader.mjs')]);
console.log(
  `Built private downloader for ${target}. No user-side Python/pip installation is needed.`,
);
