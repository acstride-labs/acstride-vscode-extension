import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import yauzl from 'yauzl';
import { validateRelease } from './validate-release.mjs';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const preRelease = process.env.RELEASE_PRE_RELEASE === 'true';
validateRelease(manifest, process.env.RELEASE_TAG || '', preRelease);
const folder = process.argv[2] || 'release-assets';
const targets = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'];
const names = targets.map((t) => `ac-stride-${manifest.version}-${t}.vsix`);
const actual = (await readdir(folder)).filter((name) => name.endsWith('.vsix')).sort();
if (JSON.stringify(actual) !== JSON.stringify([...names].sort()))
  throw new Error('Expected exactly four platform packages.');
const sums = [];
for (const [index, name] of names.entries()) {
  const file = path.join(folder, name);
  const sha = createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
  sums.push(`${sha}  ${name}`);
  const entries = await new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const collected = {};
      zip.on('error', reject);
      zip.on('end', () => resolve(collected));
      zip.on('entry', (entry) => {
        if (!['extension/package.json', 'extension.vsixmanifest'].includes(entry.fileName))
          return zip.readEntry();
        zip.openReadStream(entry, async (error, stream) => {
          if (error) return reject(error);
          try {
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            collected[entry.fileName] = Buffer.concat(chunks).toString('utf8');
            zip.readEntry();
          } catch (error) {
            zip.close();
            reject(error);
          }
        });
      });
      zip.readEntry();
    });
  });
  const packaged = JSON.parse(entries['extension/package.json']);
  if (
    packaged.publisher !== manifest.publisher ||
    packaged.name !== manifest.name ||
    packaged.version !== manifest.version
  )
    throw new Error(`Wrong extension identity in ${name}`);
  const xml = entries['extension.vsixmanifest'] || '';
  if (!xml.includes(`TargetPlatform="${targets[index]}"`))
    throw new Error(`Wrong target in ${name}`);
  const preview = /Id="Microsoft.VisualStudio.Code.PreRelease"\s+Value="true"/.test(xml);
  if (preview !== preRelease) throw new Error(`Wrong release channel in ${name}`);
}
const expected = sums.sort().join('\n');
const existing = (await readFile(path.join(folder, 'SHA256SUMS'), 'utf8'))
  .trim()
  .split(/\r?\n/)
  .sort()
  .join('\n');
if (expected !== existing)
  throw new Error('Release checksum manifest does not match the four VSIX packages.');
console.log('Verified Release checksums, version, publisher, all platform targets and channel.');
