import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as VSCode from 'vscode';
const mock = vi.hoisted(() => ({
  user: new Map<string, unknown>(),
  workspace: new Map<string, unknown>(),
  trusted: true,
  available: true,
  fail: '',
  updates: [] as { key: string; value: unknown; target: number }[],
}));
vi.mock('vscode', () => ({
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  env: { language: 'en' },
  workspace: {
    get isTrusted() {
      return mock.trusted;
    },
    get workspaceFolders() {
      return mock.available ? [{ uri: { scheme: 'file' } }] : undefined;
    },
    getConfiguration: () => ({
      inspect: (key: string) => ({
        globalValue: mock.user.get(key),
        workspaceValue: mock.workspace.get(key),
      }),
      get: (key: string, fallback: unknown) =>
        mock.workspace.get(key) ?? mock.user.get(key) ?? fallback,
      update: async (key: string, value: unknown, target: number) => {
        mock.updates.push({ key, value, target });
        if (mock.fail === key) throw new Error('write failed');
        const values = target === 1 ? mock.user : mock.workspace;
        if (value === undefined) values.delete(key);
        else values.set(key, value);
      },
    }),
  },
}));
import { SettingsController } from '../../src/vscode/settings-controller';
import type { WorkspaceController } from '../../src/vscode/workspace-controller';
import type { ContestController } from '../../src/vscode/contest-controller';
const values = {
  handle: 'tourist',
  compiler: 'clang++',
  cppArgs: ['-std=c++20'],
  cppTemplate: '',
  interpreter: 'python3',
  pythonArgs: [],
  pythonTemplate: '',
  timeoutMs: 2500,
};
function fixture() {
  const contests = { saveContestOptions: vi.fn(async () => {}) };
  const workspace = {
    submissions: {
      signIn: vi.fn(async () => {}),
      signOut: vi.fn(async () => {}),
      refreshAccount: vi.fn(async () => {}),
    },
    checkEnvironment: vi.fn(async (_language?: string, _notify?: boolean) => {}),
  };
  const controller = new SettingsController(
    {} as VSCode.ExtensionContext,
    workspace as unknown as WorkspaceController,
  );
  return {
    contests,
    workspace,
    environments: () =>
      (
        controller as unknown as {
          environments: Record<string, { status: string; message?: string }>;
        }
      ).environments,
    receive: (message: unknown) =>
      (controller as unknown as { receive(message: unknown): Promise<unknown> }).receive(message),
  };
}
beforeEach(() => {
  mock.user.clear();
  mock.workspace.clear();
  mock.updates = [];
  mock.fail = '';
  mock.trusted = true;
  mock.available = true;
});
describe('settings persistence adapter', () => {
  it('persists independent inline templates at the selected configuration scope', async () => {
    const f = fixture();
    await f.receive({
      type: 'saveSettings',
      scope: 'user',
      values: { ...values, cppTemplateCode: '// C++', pythonTemplateCode: '# Python' },
    });
    expect(mock.user.get('cpp.templateCode')).toBe('// C++');
    expect(mock.user.get('python.templateCode')).toBe('# Python');
    await f.receive({ type: 'settingsScope', scope: 'workspace' });
    await f.receive({
      type: 'saveSettings',
      scope: 'workspace',
      values: {
        ...values,
        cppTemplateCode: '// workspace C++',
        pythonTemplateCode: '# workspace Python',
      },
    });
    expect(mock.workspace.get('cpp.templateCode')).toBe('// workspace C++');
    expect(mock.user.get('cpp.templateCode')).toBe('// C++');
  });
  it('checks every supported language and keeps each outcome, even if one fails', async () => {
    const f = fixture();
    f.workspace.checkEnvironment.mockImplementation(async (language) => {
      if (language === 'cpp') throw new Error('compiler missing');
    });
    await f.receive({ type: 'checkAllEnvironments' });
    expect(f.workspace.checkEnvironment.mock.calls).toEqual([
      ['cpp', false],
      ['python', false],
    ]);
    expect(f.environments().cpp.status).toBe('failed');
    expect(f.environments().cpp.message).toBe('compiler missing');
    expect(f.environments().python.status).toBe('passed');
  });
  it('does not retain a green check if effective tool configuration changes during the check', async () => {
    const f = fixture();
    f.workspace.checkEnvironment.mockImplementation(async () => {
      mock.user.set('cpp.compiler', 'changed');
    });
    await f.receive({ type: 'checkAllEnvironments' });
    expect(f.environments()).toEqual({});
  });
  it('blocks environment execution in untrusted workspaces', async () => {
    const f = fixture();
    mock.trusted = false;
    await expect(f.receive({ type: 'checkAllEnvironments' })).rejects.toThrow('Trust');
    expect(f.workspace.checkEnvironment).not.toHaveBeenCalled();
  });
  it('persists language globally even in untrusted/no-folder mode and never edits runtime tools', async () => {
    mock.trusted = false;
    mock.available = false;
    await fixture().receive({ type: 'setLocale', locale: 'ja' });
    expect(mock.updates).toEqual([{ key: 'ui.language', value: 'ja', target: 1 }]);
  });
  it('keeps user and workspace targets separate and writes only the allowlisted settings', async () => {
    const f = fixture();
    await f.receive({ type: 'saveSettings', scope: 'user', values });
    expect(mock.user.get('cpp.compiler')).toBe('clang++');
    expect(mock.workspace.size).toBe(0);
    await f.receive({ type: 'settingsScope', scope: 'workspace' });
    await f.receive({
      type: 'saveSettings',
      scope: 'workspace',
      values: { ...values, timeoutMs: 3000 },
    });
    expect(mock.workspace.get('run.timeoutMs')).toBe(3000);
    expect(mock.user.get('run.timeoutMs')).toBe(2500);
    expect(mock.updates.some((u) => u.key === 'ui.language')).toBe(false);
    expect(mock.updates.length).toBe(20);
  });
  it('validates first and blocks untrusted execution settings, unavailable workspaces and stale scopes', async () => {
    const f = fixture();
    await expect(
      f.receive({ type: 'saveSettings', scope: 'user', values: { ...values, timeoutMs: 1 } }),
    ).rejects.toThrow('Invalid settings');
    mock.trusted = false;
    await expect(f.receive({ type: 'saveSettings', scope: 'user', values })).rejects.toThrow(
      'Trust',
    );
    mock.trusted = true;
    mock.available = false;
    await expect(f.receive({ type: 'settingsScope', scope: 'workspace' })).rejects.toThrow(
      'Open a folder',
    );
    await expect(f.receive({ type: 'saveSettings', scope: 'workspace', values })).rejects.toThrow(
      'scope changed',
    );
    expect(mock.updates).toEqual([]);
  });
  it('restores prior values after a partially failed configuration write', async () => {
    const f = fixture();
    mock.user.set('codeforces.handle', 'old');
    mock.fail = 'cpp.args';
    await expect(f.receive({ type: 'saveSettings', scope: 'user', values })).rejects.toThrow(
      'write failed',
    );
    expect(Object.fromEntries(mock.user)).toEqual({ 'codeforces.handle': 'old' });
  });
  it('routes contest preferences only to the selected contest and rejects arbitrary extra properties', async () => {
    const f = fixture(),
      options = { autoDownload: false, defaultLanguage: 'python', archived: true };
    await expect(
      f.receive({ type: 'saveContestSettings', contestId: 1234, values: options }),
    ).rejects.toThrow('Invalid settings');
    expect(f.contests.saveContestOptions).not.toHaveBeenCalled();
    await expect(
      f.receive({
        type: 'saveContestSettings',
        contestId: 1234,
        values: { ...options, root: '/tmp' },
      }),
    ).rejects.toThrow('Invalid settings');
    expect(mock.updates).toEqual([]);
  });
});

it('routes settings login, logout and refresh to the shared account without changing user settings', async () => {
  const f = fixture();
  await f.receive({ type: 'signIn' });
  await f.receive({ type: 'signOut' });
  await f.receive({ type: 'refreshAccount' });
  expect(f.workspace.submissions.signIn).toHaveBeenCalledOnce();
  expect(f.workspace.submissions.signOut).toHaveBeenCalledOnce();
  expect(f.workspace.submissions.refreshAccount).toHaveBeenCalledOnce();
  expect(mock.updates).toEqual([]);
});
