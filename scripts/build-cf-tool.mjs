// Developer/CI build only. End-user extension activation never downloads a component.
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, hostTarget } from './downloader-common.mjs';
const pin = JSON.parse(await fs.readFile(path.join(root, 'packaging', 'cf-tool.json'), 'utf8'));
if (!/^[a-f0-9]{40}$/.test(pin.revision)) throw new Error('CF Tool must be pinned to a commit.');
const go = process.env.ACSTRIDE_BUILD_GO || 'go';
const env = { ...process.env, CGO_ENABLED: '0', GOTOOLCHAIN: 'local' };
// Let the notice generator locate this same Go tool, without changing user PATH.
if (path.isAbsolute(go)) env.PATH = path.dirname(go) + path.delimiter + (env.PATH || '');
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 12000000,
    shell: false,
  });
  if (result.error || result.status !== 0)
    throw new Error(`${path.basename(command)} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}
hostTarget();
await fs.mkdir(path.join(root, '.build'), { recursive: true });
let source = process.env.ACSTRIDE_CF_TOOL_SOURCE;
if (!source) {
  source = await fs.mkdtemp(path.join(root, '.build', 'cf-tool-'));
  run('git', ['init', source], root);
  run(
    'git',
    ['remote', 'add', 'origin', 'https://github.com/acstride-labs/acstride-cf-tool.git'],
    source,
  );
  run('git', ['fetch', '--depth', '1', 'origin', pin.revision], source);
  run('git', ['checkout', '--detach', 'FETCH_HEAD'], source);
}
source = path.resolve(source);
if (
  run('git', ['rev-parse', 'HEAD'], source) !== pin.revision ||
  run('git', ['status', '--porcelain'], source)
)
  throw new Error('CF Tool source must be clean and match the pinned commit.');
const bundle = path.join(root, 'resources', 'cf-tool');
await fs.mkdir(bundle, { recursive: true });
const name = process.platform === 'win32' ? 'acstride-cf.exe' : 'acstride-cf';
const executable = path.join(bundle, name);
run(go, ['mod', 'download', 'all'], source);
run(go, ['mod', 'verify'], source);
run(go, ['build', '-trimpath', '-ldflags=-s -w', '-o', executable, './cmd/acstride-cf'], source);
run(
  go,
  ['run', './tools/notices', '-output', path.join(bundle, 'THIRD_PARTY_NOTICES.txt')],
  source,
);
await fs.copyFile(path.join(source, 'LICENSE'), path.join(bundle, 'LICENSE'));
const files = {};
for (const file of [name, 'THIRD_PARTY_NOTICES.txt', 'LICENSE'])
  files[file] = createHash('sha256')
    .update(await fs.readFile(path.join(bundle, file)))
    .digest('hex');
await fs.writeFile(
  path.join(bundle, 'manifest.json'),
  JSON.stringify({ protocol: 1, target: hostTarget(), revision: pin.revision, files }, null, 2),
);
console.log(`Built pinned CF Tool for ${hostTarget()}.`);
