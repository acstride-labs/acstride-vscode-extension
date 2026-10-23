import * as vscode from 'vscode';
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
  constructor(
    private context: vscode.ExtensionContext,
    private workspace: WorkspaceController,
  ) {}
  register() {
    this.disposables.push(
      vscode.commands.registerCommand('cfide.openSettings', () => this.open()),
      vscode.workspace.onDidChangeConfiguration((event) => {
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
  private async open() {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'cfide.settings',
        t('CFIDE · Settings'),
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
      if (message.type === 'setLocale') {
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
              'Some settings could not be restored. Review CFIDE settings in VS Code.',
            );
          throw error;
        }
        this.notice = 'Settings saved.';
      } else if (message.type === 'checkEnvironment') {
        await this.workspace.checkEnvironment(message.language);
        this.notice = 'Environment check passed.';
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
    const state: SettingsState = {
      locale: currentLocale(),
      preference: config.get<LocalePreference>('ui.language', 'auto'),
      scope: this.scope,
      values,
      workspaceAvailable: !!this.workspaceAvailable(),
      trusted: vscode.workspace.isTrusted,
      busy: this.busy,
      notice: this.notice,
      error: this.error,
    };
    if (!this.panel) return;
    this.panel.title = t('CFIDE · Settings');
    postLocale(this.panel.webview);
    void this.panel.webview.postMessage({ type: 'settingsState', state });
    this.notice = undefined;
  }
  dispose() {
    this.panel?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
