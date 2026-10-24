import { afterEach, describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  instantiateTemplate,
  readSourceTemplate,
} from '../../src/infrastructure/storage/source-template';
import { FileWorkspaceStore } from '../../src/infrastructure/storage/file-workspace-store';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })),
  );
});
async function fixture() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-template-'));
  folders.push(folder);
  const bundled = path.join(folder, 'builtin'),
    file = path.join(folder, 'legacy');
  await fs.writeFile(bundled, 'builtin ${PROBLEM_ID}');
  await fs.writeFile(file, 'legacy');
  return { folder, bundled, file };
}
describe('editable initial code templates', () => {
  it('preserves inline code exactly, with legacy-file and built-in fallbacks', async () => {
    const { bundled, file } = await fixture();
    expect(await readSourceTemplate({ code: '\nprint("hello")\n', file, bundled })).toBe(
      '\nprint("hello")\n',
    );
    expect(await readSourceTemplate({ code: '', file, bundled })).toBe('legacy');
    expect(await readSourceTemplate({ code: '  ', bundled })).toBe('builtin ${PROBLEM_ID}');
    expect(instantiateTemplate('${PROBLEM_ID}: ${PROBLEM_ID}', 'G2')).toBe('G2: G2');
  });
  it('creates independent language sources without overwriting existing work', async () => {
    const { folder } = await fixture(),
      store = new FileWorkspaceStore(folder);
    await store.createProblem('A', 'Test', 'custom C++', 'cpp');
    await store.selectLanguage('A', 'python', 'custom Python');
    await store.selectLanguage('A', 'cpp', 'changed C++ template');
    await store.selectLanguage('A', 'python', 'changed Python template');
    expect(await fs.readFile(store.sourcePath('A', 'cpp'), 'utf8')).toBe('custom C++');
    expect(await fs.readFile(store.sourcePath('A', 'python'), 'utf8')).toBe('custom Python');
  });
  it('rejects oversized file templates', async () => {
    const { file, bundled } = await fixture();
    await fs.writeFile(file, 'x'.repeat(1_000_001));
    await expect(readSourceTemplate({ file, bundled })).rejects.toThrow('1 MB');
  });
});
