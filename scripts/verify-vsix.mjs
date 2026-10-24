import yauzl from 'yauzl';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { root, hostTarget, cleanEnvironment, hashes } from './downloader-common.mjs';
import { verifyCfTool } from './verify-cf-tool.mjs';

const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const archive = path.join(root, `ac-stride-${manifest.version}-${hostTarget()}.vsix`);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-vsix-test-'));
try {
  let platformManifest = '';
  const names = [];
  const nativeCatalogs = new Map();
  await new Promise((resolve, reject) => {
    yauzl.open(archive, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', async (entry) => {
        try {
          const name = entry.fileName;
          names.push(name);
          if (
            (!name.startsWith('extension/resources/downloader/') &&
              !name.startsWith('extension/resources/cf-tool/') &&
              !/^extension\/package\.nls(?:\.(?:zh-cn|ru|ja))?\.json$/.test(name) &&
              name !== 'extension.vsixmanifest') ||
            name.endsWith('/')
          )
            return zip.readEntry();
          const stream = await new Promise((yes, no) =>
            zip.openReadStream(entry, (err, value) => (err ? no(err) : yes(value))),
          );
          const chunks = [];
          for await (const chunk of stream) chunks.push(chunk);
          const data = Buffer.concat(chunks);
          if (name === 'extension.vsixmanifest') platformManifest = data.toString('utf8');
          else if (name.startsWith('extension/package.nls'))
            nativeCatalogs.set(name, JSON.parse(data.toString('utf8')));
          else {
            const destination = path.resolve(temp, name);
            if (!destination.startsWith(temp + path.sep)) throw new Error('Unsafe ZIP path');
            await fs.mkdir(path.dirname(destination), { recursive: true });
            await fs.writeFile(destination, data, {
              mode: (entry.externalFileAttributes >>> 16) & 0o777 || 0o644,
            });
          }
          zip.readEntry();
        } catch (error) {
          zip.close();
          reject(error);
        }
      });
      zip.readEntry();
    });
  });
  if (!platformManifest.includes(`TargetPlatform="${hostTarget()}"`))
    throw new Error('VSIX is not targeted to the bundled platform');
  const nlsTokens = [...JSON.stringify(manifest).matchAll(/%([A-Za-z0-9_.-]+)%/g)].map(
    (match) => match[1],
  );
  for (const suffix of ['', '.zh-cn', '.ru', '.ja']) {
    const catalog = nativeCatalogs.get(`extension/package.nls${suffix}.json`);
    if (!catalog || nlsTokens.some((token) => !catalog[token]))
      throw new Error(`VSIX is missing native localization resources: ${suffix || 'en'}`);
  }
  if (
    names.some(
      (name) =>
        /^extension\/(?:\.build|packaging|scripts)\//.test(name) ||
        name.startsWith('extension/resources/helpers/'),
    )
  )
    throw new Error('VSIX leaked build tools or the unbundled helper');
  const bundle = path.join(temp, 'extension', 'resources', 'downloader');
  await verifyCfTool(path.join(temp, 'extension', 'resources', 'cf-tool'));
  const embeddedManifest = JSON.parse(
    await fs.readFile(path.join(bundle, 'manifest.json'), 'utf8'),
  );
  const sourcePin = JSON.parse(
    await fs.readFile(path.join(root, 'packaging', 'cf-tool.json'), 'utf8'),
  );
  if (embeddedManifest.revision !== sourcePin.revision)
    throw new Error('Extracted transport source pin mismatch');
  const actual = await hashes(bundle);
  delete actual['manifest.json'];
  if (
    JSON.stringify(Object.entries(actual).sort()) !==
    JSON.stringify(Object.entries(embeddedManifest.files).sort())
  )
    throw new Error('VSIX lost or modified bundled downloader files');
  const executable = path.join(
    bundle,
    'cfide-downloader',
    process.platform === 'win32' ? 'cfide-downloader.exe' : 'cfide-downloader',
  );
  const result = spawnSync(executable, ['--self-test'], {
    cwd: temp,
    encoding: 'utf8',
    timeout: 20000,
    env: {
      ...cleanEnvironment(),
      PATH: '',
      HOME: temp,
      USERPROFILE: temp,
      PYINSTALLER_RESET_ENVIRONMENT: '1',
    },
  });
  if (result.error || result.status !== 0)
    throw new Error(`Extracted VSIX downloader failed: ${result.error?.message ?? result.stderr}`);
  const health = JSON.parse(result.stdout);
  if (!health.embedded || !health.ready || !health.caBundle)
    throw new Error('Extracted VSIX lacks a working embedded runtime/CA bundle');
  console.log(
    `Verified final VSIX ${path.basename(archive)}: four-language native resources, complete bundle + notices, platform target, executable permissions, and Python-free startup.`,
  );
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
