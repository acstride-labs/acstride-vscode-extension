import * as vscode from 'vscode';
import path from 'node:path';
import { languages } from '../domain/languages';
import { readSourceTemplate } from '../infrastructure/storage/source-template';
import {
  settingsKeys,
  settingsRequestSchema,
  type SettingsState,
  type SettingsValues,
} from '../shared/settings-protocol';
import type { LocalePreference } from '../shared/i18n';
import { currentLocale, postLocale, t } from './localization';
import { webviewHtml } from './webview-html';
import type { WorkspaceController } from './workspace-controller';

export class SettingsController implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private scope: 'user' | 'workspace' = 'user';
  private busy = false;
  private notice?: string;
  private error?: string;
  private environments: SettingsState['environments'] = {};
  constructor(
    private context: vscode.ExtensionContext,
    private workspace: WorkspaceController,
  ) {}
  register() {
    const subscription = this.workspace.submissions?.onAccountChanged(() => {
      void this.publish();
    });
    if (subscription) this.disposables.push(subscription);
    this.disposables.push(
      vscode.commands.registerCommand('cfide.openSettings', () => this.open()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          [
            'cfide.cpp.compiler',
            'cfide.cpp.args',
            'cfide.python.interpreter',
            'cfide.python.args',
          ].some((key) => event.affectsConfiguration(key))
        )
          this.environments = {};
        if (!event.affectsConfiguration('cfide') || this.busy) return;
        void this.publish();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.scope = 'user';
        void this.publish();
      }),
    );
  }
  private workspaceAvailable() {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.length === 1 && folders[0].uri.scheme === 'file';
  }
  private executionFingerprint() {
    const config = vscode.workspace.getConfiguration('cfide');
    return JSON.stringify(
      ['cpp.compiler', 'cpp.args', 'python.interpreter', 'python.args'].map((key) =>
        config.get(key),
      ),
    );
  }
  private async open() {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'cfide.settings',
        t('AC-Stride · Settings'),
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')],
        },
      );
      this.panel.webview.html = webviewHtml(
        this.panel.webview,
        this.context.extensionUri,
        'settings',
      );
      this.panel.onDidChangeViewState(
        (event) => {
          if (event.webviewPanel.visible) void this.workspace.submissions?.refreshAccount();
        },
        null,
        this.disposables,
      );
      this.panel.onDidDispose(
        () => {
          this.panel = undefined;
        },
        null,
        this.disposables,
      );
      this.panel.webview.onDidReceiveMessage(
        (raw) => {
          void this.receive(raw).catch((error) => {
            this.error = error instanceof Error ? error.message : String(error);
            void this.publish();
          });
        },
        null,
        this.disposables,
      );
    } else this.panel.reveal(vscode.ViewColumn.One);
    await this.publish();
    void this.workspace.submissions?.refreshAccount();
  }
  private async receive(raw: unknown) {
    const parsed = settingsRequestSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error(
        'Invalid settings. Check handle, executable paths, argument arrays and timeout (100–60000 ms).',
      );
    const message = parsed.data;
    if (message.type === 'ready') return this.publish();
    if (this.busy) throw new Error('Settings operation in progress.');
    this.error = undefined;
    this.notice = undefined;
    if (message.type === 'settingsScope') {
      if (message.scope === 'workspace' && !this.workspaceAvailable())
        throw new Error('Open a folder in VS Code first.');
      this.scope = message.scope;
      return this.publish();
    }
    this.busy = true;
    await this.publish();
    try {
      if (
        message.type === 'signIn' ||
        message.type === 'signOut' ||
        message.type === 'refreshAccount'
      ) {
        const submissions = this.workspace.submissions;
        if (!submissions) throw new Error(t('Submission client is unavailable.'));
        if (message.type === 'signIn') await submissions.signIn();
        else if (message.type === 'signOut') await submissions.signOut();
        else await submissions.refreshAccount();
      } else if (message.type === 'setLocale') {
        await vscode.workspace
          .getConfiguration('cfide')
          .update('ui.language', message.locale, vscode.ConfigurationTarget.Global);
      } else if (message.type === 'saveSettings') {
        if (!vscode.workspace.isTrusted)
          throw new Error('Trust this workspace before changing execution settings.');
        if (message.scope !== this.scope)
          throw new Error('Settings scope changed. Reload settings and retry.');
        if (this.scope === 'workspace' && !this.workspaceAvailable())
          throw new Error('Open a folder in VS Code first.');
        const config = vscode.workspace.getConfiguration('cfide');
        const executionBefore = this.executionFingerprint();
        const target =
          this.scope === 'workspace'
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
        // Validate the entire payload before writing. Restore prior values if a partial update fails.
        const written: { key: string; value: unknown }[] = [];
        try {
          for (const [field, key] of Object.entries(settingsKeys)) {
            const before = config.inspect(key);
            const value = this.scope === 'workspace' ? before?.workspaceValue : before?.globalValue;
            await config.update(key, message.values[field as keyof SettingsValues], target);
            written.push({ key, value });
          }
        } catch (error) {
          const rollback = await Promise.allSettled(
            written.reverse().map(({ key, value }) => config.update(key, value, target)),
          );
          if (rollback.some((result) => result.status === 'rejected'))
            throw new Error(
              'Some settings could not be restored. Review AC-Stride settings in VS Code.',
            );
          throw error;
        }
        if (executionBefore !== this.executionFingerprint()) this.environments = {};
        this.notice = 'Settings saved.';
      } else if (message.type === 'checkEnvironment' || message.type === 'checkAllEnvironments') {
        if (!vscode.workspace.isTrusted)
          throw new Error('Trust this workspace before changing execution settings.');
        const config = vscode.workspace.getConfiguration('cfide');
        const before = this.executionFingerprint();
        const selected =
          message.type === 'checkAllEnvironments'
            ? (['cpp', 'python'] as const)
            : [message.language];
        for (const language of selected) {
          const command = config.get<string>(
            language === 'cpp' ? 'cpp.compiler' : 'python.interpreter',
            language === 'cpp' ? 'g++' : 'python3',
          );
          this.environments[language] = { status: 'checking', command };
          await this.publish();
          try {
            await this.workspace.checkEnvironment(language, false);
            this.environments[language] = { status: 'passed', command };
          } catch (error) {
            this.environments[language] = {
              status: 'failed',
              command,
              message: error instanceof Error ? error.message : String(error),
            };
          }
          await this.publish();
        }
        if (this.executionFingerprint() !== before) {
          this.environments = {};
          this.notice = 'Environment changed. Run checks again.';
        }
      }
    } finally {
      this.busy = false;
      await this.publish();
    }
  }
  private async publish() {
    if (!this.panel) return;
    const config = vscode.workspace.getConfiguration('cfide');
    const values = Object.fromEntries(
      Object.entries(settingsKeys).map(([field, key]) => {
        const value = config.inspect(key);
        return [
          field,
          (this.scope === 'workspace' ? value?.workspaceValue : undefined) ??
            value?.globalValue ??
            value?.defaultValue,
        ];
      }),
    ) as SettingsValues;
    const defaultTemplates = { cpp: '', python: '' };
    const templatePreviews = { cpp: '', python: '' };
    const templateWarnings: SettingsState['templateWarnings'] = {};
    for (const language of ['cpp', 'python'] as const) {
      const bundled = path.join(
        this.context.extensionPath,
        'resources',
        'templates',
        languages[language].template,
      );
      defaultTemplates[language] = await readSourceTemplate({ bundled });
      try {
        templatePreviews[language] = await readSourceTemplate({
          code: values[language === 'cpp' ? 'cppTemplateCode' : 'pythonTemplateCode'],
          file: vscode.workspace.isTrusted
            ? values[language === 'cpp' ? 'cppTemplate' : 'pythonTemplate']
            : undefined,
          bundled,
        });
      } catch {
        templatePreviews[language] = defaultTemplates[language];
        templateWarnings[language] = true;
      }
    }
    const state: SettingsState = {
      account: this.workspace.submissions?.accountState ?? { status: 'signedOut' },
      locale: currentLocale(),
      preference: config.get<LocalePreference>('ui.language', 'auto'),
      scope: this.scope,
      values,
      defaultTemplates,
      templatePreviews,
      templateWarnings,
      environments: this.environments,
      workspaceAvailable: !!this.workspaceAvailable(),
      trusted: vscode.workspace.isTrusted,
      busy: this.busy,
      notice: this.notice,
      error: this.error,
    };
    if (!this.panel) return;
    this.panel.title = t('AC-Stride · Settings');
    postLocale(this.panel.webview);
    void this.panel.webview.postMessage({ type: 'settingsState', state });
    this.notice = undefined;
  }
  dispose() {
    this.panel?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
