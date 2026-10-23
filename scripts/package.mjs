import path from 'node:path';
import { promises as fs } from 'node:fs';
import { root, hostTarget, run } from './downloader-common.mjs';
import { verifyDownloader } from './verify-downloader.mjs';

await verifyDownloader();
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
await run(process.execPath, [
  path.join(root, 'node_modules', '@vscode', 'vsce', 'vsce'),
  'package',
  '--no-dependencies',
  '--target',
  hostTarget(),
  '--out',
  `cfide-${manifest.version}-${hostTarget()}.vsix`,
]);
