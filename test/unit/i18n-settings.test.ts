import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { catalogs, locales, resolveLocale, translate } from '../../src/shared/i18n';
import { settingsRequestSchema, settingsValuesSchema } from '../../src/shared/settings-protocol';
import { contestRequestSchema } from '../../src/shared/contest-protocol';

describe('configurable localization', () => {
  it('uses AC-Stride branding while preserving existing extension and workspace identities', async () => {
    const manifest = JSON.parse(await fs.readFile('package.json', 'utf8'));
    expect(manifest.displayName).toBe('Codeforces Workbench');
    expect(manifest.name).toBe('codeforces-workbench');
    expect(manifest.publisher).toBe('acstride');
    expect(manifest.repository.url).toBe(
      'https://github.com/acstride-labs/codeforces-workbench.git',
    );
    expect(manifest.activationEvents).toContain('workspaceContains:.codeforces-workbench/contests.json');
    for (const locale of locales) {
      expect(Object.values(catalogs[locale]).join('\n')).not.toMatch(/Codeforces Workbench|ACStride/);
    }
    for (const suffix of ['', '.zh-cn', '.ru', '.ja']) {
      const nls = JSON.parse(await fs.readFile(`package.nls${suffix}.json`, 'utf8'));
      expect(nls['view.testPanel']).toMatch(/^AC-Stride · /);
      expect(nls['command.codeforcesWorkbench.openSettings']).toMatch(/^AC-Stride: /);
    }
  });
  it('uses familiar developer terminology and idiomatic mismatch messages', () => {
    expect(translate('zh-CN', 'First difference at token {token}', { token: 1 })).toBe(
      '第 1 个 token 不一致',
    );
    expect(translate('zh-CN', '(missing token)')).toBe('（缺少 token）');
    expect(Object.values(catalogs['zh-CN']).join('\n')).not.toContain('词元');
    expect(Object.values(catalogs['zh-CN']).join('\n')).not.toContain('复制题目');
    expect(translate('zh-CN', 'One-click submit')).toBe('一键提交');
    expect(translate('en', 'First difference at token {token}', { token: 2 })).toBe(
      'First mismatch: token 2',
    );
    expect(translate('ru', 'First difference at token {token}', { token: 2 })).toBe(
      'Первое несовпадение: токен №2',
    );
    expect(translate('ja', 'First difference at token {token}', { token: 2 })).toBe(
      '最初の不一致：2 個目のトークン',
    );
  });
  it('has complete nonempty four-language catalogs with exactly matching placeholders', () => {
    const placeholders = (s: string) =>
      [...s.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]).sort();
    const keys = Object.keys(catalogs.en).sort();
    expect(keys.length).toBeGreaterThan(200);
    for (const locale of locales) {
      expect(Object.keys(catalogs[locale]).sort()).toEqual(keys);
      for (const key of keys) {
        expect(catalogs[locale][key].trim(), `${locale}: ${key}`).not.toBe('');
        expect(placeholders(catalogs[locale][key]), `${locale}: ${key}`).toEqual(
          placeholders(catalogs.en[key]),
        );
      }
    }
  });
  it('resolves manual preferences, editor language and unsupported-language fallback', () => {
    expect(resolveLocale('auto', 'zh-cn')).toBe('zh-CN');
    expect(resolveLocale('auto', 'ru-RU')).toBe('ru');
    expect(resolveLocale('auto', 'ja')).toBe('ja');
    expect(resolveLocale('auto', 'fr')).toBe('en');
    expect(resolveLocale('en', 'zh-cn')).toBe('en');
    expect(resolveLocale('zh-CN', 'ru')).toBe('zh-CN');
    expect(resolveLocale('unknown', 'ja-JP')).toBe('ja');
  });
  it('formats parameters and stored diagnostics without corrupting unknown technical output', () => {
    expect(translate('zh-CN', '{ready}/{total} problems ready.', { ready: 2, total: 3 })).toBe(
      '已就绪 2/3 道题。',
    );
    expect(translate('ru', 'Updated {time}', { time: '12:30' })).toBe('Обновлено: 12:30');
    expect(translate('ja', 'Problem A already exists.')).toBe('問題 A はすでに存在します。');
    expect(translate('zh-CN', 'Public problem download returned HTTP 429.')).toBe(
      '公开题目下载返回 HTTP 429。',
    );
    expect(translate('ja', translate('ru', 'Running tests…'))).toBe('テスト実行中…');
    for (const value of ['clang++: unknown option', 'toString', '__proto__', '{literal code}'])
      expect(translate('ru', value)).toBe(value);
  });
  it('keeps every literal translation call configured in the catalog', async () => {
    const roots = ['src/vscode', 'webview/src'];
    for (const root of roots) {
      const files = await fs.readdir(root, { recursive: true });
      for (const file of files.filter((file) => /\.tsx?$/.test(file))) {
        const full = path.join(root, file),
          source = ts.createSourceFile(
            full,
            await fs.readFile(full, 'utf8'),
            ts.ScriptTarget.Latest,
            true,
          );
        function visit(node: ts.Node) {
          if (
            ts.isCallExpression(node) &&
            node.expression.getText(source) === 't' &&
            node.arguments[0] &&
            ts.isStringLiteral(node.arguments[0])
          )
            expect(
              Object.hasOwn(catalogs.en, node.arguments[0].text),
              `${full}: ${node.arguments[0].text}`,
            ).toBe(true);
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  });
  it('localizes manifest commands, native views, welcome text and configuration descriptions', async () => {
    const manifest = JSON.parse(await fs.readFile('package.json', 'utf8'));
    const english = JSON.parse(await fs.readFile('package.nls.json', 'utf8'));
    const tokens = [...JSON.stringify(manifest).matchAll(/%([A-Za-z0-9_.-]+)%/g)].map(
      (match) => match[1],
    );
    for (const suffix of ['', '.zh-cn', '.ru', '.ja']) {
      const nls = JSON.parse(await fs.readFile(`package.nls${suffix}.json`, 'utf8'));
      expect(Object.keys(nls).sort()).toEqual(Object.keys(english).sort());
      for (const token of tokens) expect(nls[token], token).toBeTruthy();
    }
    expect(
      manifest.contributes.commands.find(
        (c: { command: string }) => c.command === 'codeforcesWorkbench.openSettings',
      ).icon,
    ).toBe('$(gear)');
    expect(
      manifest.contributes.menus['view/title'].find(
        (c: { command: string }) => c.command === 'codeforcesWorkbench.openSettings',
      ).group,
    ).toMatch(/^navigation(?:@\d+)?$/);
    expect(manifest.contributes.configuration.properties['codeforcesWorkbench.ui.language'].scope).toBe(
      'application',
    );
  });
});

describe('settings page boundaries', () => {
  const values = {
    handle: 'tourist',
    compiler: 'g++',
    cppArgs: ['-std=c++20'],
    cppTemplate: '',
    interpreter: 'python3',
    pythonArgs: [],
    pythonTemplate: '',
    timeoutMs: 2000,
  };
  it('validates all setting values and refuses arbitrary keys, unsafe shapes and invalid languages', () => {
    expect(settingsValuesSchema.safeParse(values).success).toBe(true);
    for (const value of [
      { ...values, handle: 'bad/path' },
      { ...values, timeoutMs: 99 },
      { ...values, timeoutMs: 60001 },
      { ...values, timeoutMs: 200.5 },
      { ...values, compiler: '' },
      { ...values, pythonArgs: '-u' },
      { ...values, token: 'secret' },
    ])
      expect(settingsValuesSchema.safeParse(value).success).toBe(false);
    for (const locale of ['auto', ...locales])
      expect(settingsRequestSchema.safeParse({ type: 'setLocale', locale }).success).toBe(true);
    expect(settingsRequestSchema.safeParse({ type: 'setLocale', locale: 'fr' }).success).toBe(
      false,
    );
    expect(
      settingsRequestSchema.safeParse({ type: 'saveSettings', scope: 'user', values }).success,
    ).toBe(true);
    expect(
      settingsRequestSchema.safeParse({ type: 'saveSettings', scope: 'machine', values }).success,
    ).toBe(false);
  });
  it('keeps global preferences in Settings and scopes contest preferences to contest details', async () => {
    for (const type of [
      'watchHandle',
      'archive',
      'autoDownload',
      'defaultLanguage',
      'checkEnvironment',
    ])
      expect(
        contestRequestSchema.safeParse({
          type,
          contestId: 1,
          language: 'cpp',
          enabled: true,
          archived: true,
        }).success,
      ).toBe(false);
    expect(
      contestRequestSchema.safeParse({
        type: 'saveContestSettings',
        contestId: 1,
        values: { defaultLanguage: 'python', archived: false },
      }).success,
    ).toBe(false);
    const center = await fs.readFile('webview/src/contest/ContestApp.tsx', 'utf8');
    expect(center).not.toContain('ContestOptions');
    for (const type of ['setLocale', 'watchHandle', 'checkEnvironment', 'saveSettings'])
      expect(center).not.toContain(`type: '${type}'`);
    const request = {
      type: 'saveContestSettings',
      contestId: 1,
      values: { defaultLanguage: 'python', archived: false },
    };
    expect(settingsRequestSchema.safeParse(request).success).toBe(false);
    expect(
      contestRequestSchema.safeParse({ ...request, values: { ...request.values, root: '/tmp' } })
        .success,
    ).toBe(false);
    expect(
      contestRequestSchema.safeParse({ type: 'importHtml', contestId: 1, index: 'A' }).success,
    ).toBe(false);
    const settings = await fs.readFile('webview/src/settings/SettingsApp.tsx', 'utf8');
    for (const text of ['ContestOptions', 'Public downloader', 'openContestCenter'])
      expect(settings).not.toContain(text);
  });
});
