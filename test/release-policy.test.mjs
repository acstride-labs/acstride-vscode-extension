import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRelease } from '../scripts/validate-release.mjs';
const manifest = { publisher: 'acstride', name: 'codeforces-workbench', version: '0.1.0' };
test('first public alpha uses numeric version and an explicit pre-release channel', () => {
  assert.deepEqual(validateRelease(manifest, 'v0.1.0', true), {
    version: '0.1.0',
    preRelease: true,
  });
  assert.deepEqual(validateRelease({ ...manifest, version: '0.2.0' }, 'v0.2.0', false), {
    version: '0.2.0',
    preRelease: false,
  });
});
test('rejects mismatched tags, suffixes, wrong channels and unexpected publisher identities', () => {
  for (const tag of ['v0.1.1', 'v0.1.0-alpha.1', '0.1.0', 'v01.1.0', 'v0.1.0; echo bad'])
    assert.throws(() => validateRelease(manifest, tag, true));
  assert.throws(() => validateRelease(manifest, 'v0.1.0', false));
  assert.throws(() => validateRelease(manifest, 'v0.1.0', undefined));
  assert.throws(() =>
    validateRelease({ ...manifest, publisher: 'codeforces-workbench-dev' }, 'v0.1.0', true),
  );
  assert.throws(() => validateRelease({ ...manifest, name: 'different' }, 'v0.1.0', true));
});
