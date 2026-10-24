import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export function validateRelease(manifest, tag, preRelease) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || tag !== `v${manifest.version}`)
    throw new Error('Release tag must be v<package.json version>, with three numeric components.');
  if (manifest.publisher !== 'acstride' || manifest.name !== 'cfide')
    throw new Error('Unexpected Marketplace extension identity.');
  if (typeof preRelease !== 'boolean') throw new Error('Release channel must be explicit.');
  const minor = Number(manifest.version.split('.')[1]);
  if (preRelease !== (minor % 2 === 1))
    throw new Error('Use odd minor versions for pre-release and even minor versions for stable.');
  return { version: manifest.version, preRelease };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const channel = process.env.RELEASE_PRE_RELEASE;
  if (!['true', 'false'].includes(channel)) throw new Error('Missing release channel.');
  console.log(
    JSON.stringify(validateRelease(manifest, process.env.RELEASE_TAG || '', channel === 'true')),
  );
}
