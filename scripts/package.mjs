import path from 'node:path';
import { promises as fs } from 'node:fs';
import { root, hostTarget, run } from './downloader-common.mjs';
import { verifyDownloader } from './verify-downloader.mjs';
import { verifyCodeforcesClient } from './verify-codeforces-client.mjs';

await verifyDownloader();
await verifyCodeforcesClient();
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
await run(process.execPath, [
  path.join(root, 'node_modules', '@vscode', 'vsce', 'vsce'),
  'package',
  '--no-dependencies',
  '--githubBranch',
  'master',
  ...(process.env.CODEFORCES_WORKBENCH_PRE_RELEASE === 'true' ? ['--pre-release'] : []),
  '--target',
  hostTarget(),
  '--out',
  `codeforces-workbench-${manifest.version}-${hostTarget()}.vsix`,
]);
