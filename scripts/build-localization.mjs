import { promises as fs } from 'node:fs';
import path from 'node:path';
import { root } from './downloader-common.mjs';
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const mapping = JSON.parse(
  await fs.readFile(path.join(root, 'resources/localization/manifest.json'), 'utf8'),
);
const english = JSON.parse(
  await fs.readFile(path.join(root, 'src/shared/locales/en.json'), 'utf8'),
);
for (const [locale, suffix] of [
  ['en', ''],
  ['zh-CN', '.zh-cn'],
  ['ru', '.ru'],
  ['ja', '.ja'],
]) {
  const catalog = JSON.parse(
    await fs.readFile(path.join(root, `src/shared/locales/${locale}.json`), 'utf8'),
  );
  const text = (key) => {
    if (!Object.hasOwn(catalog, key)) throw new Error(`Missing ${locale} translation: ${key}`);
    return catalog[key];
  };
  const values = {};
  for (const [id, key] of Object.entries(mapping.commands))
    values['command.' + id] = 'AC-Stride: ' + text(key);
  values['view.contests'] = text('Codeforces Contests');
  values['view.practice'] = text('Local Practice');
  values['view.tests'] = text('Tests');
  values['view.testPanel'] = 'AC-Stride · ' + text('Tests');
  values['welcome.contests'] =
    text('Prepare a contest before it starts.') +
    '\n[' +
    text('Add contest') +
    '](command:cfide.addContest)\n[' +
    text('Open Contest Center') +
    '](command:cfide.openContestCenter)\n[' +
    text('Open Settings') +
    '](command:cfide.openSettings)';
  values['welcome.practice'] =
    text('Create a C++ or Python problem to get started.') +
    '\n[' +
    text('Create Local Problem') +
    '](command:cfide.createProblem)';
  values['trust.description'] = text(
    'Reading problems is supported; compiling and running requires a trusted workspace.',
  );
  values['language.auto'] = text('Follow VS Code');
  for (const [key, property] of Object.entries(manifest.contributes.configuration.properties)) {
    const token = `setting.${key}`;
    // Source strings are centralized in the catalog; do not copy translated text into package.json.
    const source = mapping.settings[key];
    if (property.description !== `%${token}%`)
      throw new Error('Manifest NLS placeholder missing for ' + key);
    if (!Object.hasOwn(english, source))
      throw new Error('Missing English setting resource: ' + key);
    values[token] = text(source);
  }
  await fs.writeFile(
    path.join(root, `package.nls${suffix}.json`),
    JSON.stringify(values, null, 2) + '\n',
  );
}
console.log('Built native VS Code localization resources for en, zh-CN, ru and ja.');
