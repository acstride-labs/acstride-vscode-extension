import { languageIds } from '../domain/models';
import { languageRunConfig } from '../infrastructure/execution/language-runner';
import { AiSettings } from './ai-settings';
import { AiClient } from '../infrastructure/ai/client';
import type { AiState } from '../shared/ai-protocol';
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
  private ai: AiSettings;
  private aiResult?: AiState['result'];
  private aiNotice?: string;
  private aiAbort?: AbortController;
  private panel?: vscode.WebviewPanel;
  private panelReady = false;
  private requestedTab?: string;
  private disposables: vscode.Disposable[] = [];
  private scope: 'user' | 'workspace' = 'user';
  private busy = false;
  private notice?: string;
  private error?: string;
  private environments: SettingsState['environments'] = {};
  constructor(
    private context: vscode.ExtensionContext,
    private workspace: WorkspaceController,
    private aiClient = new AiClient(),
  ) {
    this.ai = new AiSettings(context);
  }
  private async syncAccountHandle() {
    const account = this.workspace.submissions?.accountState;
    if (account?.status !== 'signedIn' || !account.handle) return;
    const config = vscode.workspace.getConfiguration('codeforcesWorkbench');
    if (config.get('codeforces.handle') === account.handle) return;
    const inspected = config.inspect('codeforces.handle');
    await config.update(
      'codeforces.handle',
      account.handle,
      inspected?.workspaceValue !== undefined
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global,
    );
  }
  register() {
    void this.syncAccountHandle().catch((error) => {
      this.error = String(error);
    });
    const subscription = this.workspace.submissions?.onAccountChanged(() => {
      void this.syncAccountHandle()
        .then(() => this.publish())
        .catch((error) => {
          this.error = String(error);
          void this.publish();
        });
    });
    if (subscription) this.disposables.push(subscription);
    this.disposables.push(
      vscode.commands.registerCommand('codeforcesWorkbench.openSettings', (tab?: string) => this.open(tab)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          [
            'codeforcesWorkbench.cpp.compiler',
            'codeforcesWorkbench.cpp.args',
            'codeforcesWorkbench.python.interpreter',
            'codeforcesWorkbench.python.args',
            ...['java', 'kotlin'].flatMap((language) =>
              ['compiler', 'args', 'runtime', 'runtimeArgs'].map(
                (key) => `codeforcesWorkbench.${language}.${key}`,
              ),
            ),
          ].some((key) => event.affectsConfiguration(key))
        )
          this.environments = {};
        if (!event.affectsConfiguration('codeforcesWorkbench') || this.busy) return;
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
    const config = vscode.workspace.getConfiguration('codeforcesWorkbench');
    return JSON.stringify(
      [
        'cpp.compiler',
        'cpp.args',
        'python.interpreter',
        'python.args',
        'java.compiler',
        'java.args',
        'java.runtime',
        'java.runtimeArgs',
        'kotlin.compiler',
        'kotlin.args',
        'kotlin.runtime',
        'kotlin.runtimeArgs',
      ].map((key) => config.get(key)),
    );
  }
  private async open(tab?: string) {
    this.requestedTab = ['environment', 'basic', 'coding', 'assistance'].includes(tab ?? '')
      ? tab
      : undefined;
    if (!this.panel) {
      this.panelReady = false;
      this.panel = vscode.window.createWebviewPanel(
        'codeforcesWorkbench.settings',
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
          this.aiAbort?.abort();
          this.panel = undefined;
          this.panelReady = false;
          this.requestedTab = undefined;
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
    await this.flushNavigation();
    void this.workspace.submissions?.refreshAccount();
  }
  private async flushNavigation() {
    if (!this.panelReady || !this.panel || !this.requestedTab) return;
    const tab = this.requestedTab;
    const delivered = await this.panel.webview.postMessage({ type: 'settingsTab', tab });
    if (delivered && this.requestedTab === tab) this.requestedTab = undefined;
  }
  private async receive(raw: unknown) {
    const parsed = settingsRequestSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error(
        'Invalid settings. Check handle, executable paths, argument arrays and timeout (100–60000 ms).',
      );
    const message = parsed.data;
    if (message.type === 'ready') {
      this.panelReady = true;
      await this.publish();
      await this.flushNavigation();
      return;
    }
    if (message.type === 'saveAiCacheSettings') {
      await this.ai.saveCacheOptions(message.options);
      await this.aiClient.configureCache(message.options);
      void this.panel?.webview.postMessage({ type: 'aiCacheSettingsSaved' });
      return this.publish();
    }
    if (message.type === 'saveAssistanceSettings') {
      try {
        await this.ai.saveAssistanceOptions({
          ...this.ai.assistanceOptions(),
          [message.kind]: message.options[message.kind],
        });
        void this.panel?.webview.postMessage({ type: 'assistanceSettingsSaved' });
      } catch (error) {
        void this.panel?.webview.postMessage({
          type: 'assistanceSettingsFailed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return this.publish();
    }
    if (message.type === 'saveTranslationSettings') {
      try {
        await this.ai.saveTranslationOptions(message.options);
        void this.panel?.webview.postMessage({ type: 'translationSettingsSaved' });
      } catch (error) {
        void this.panel?.webview.postMessage({
          type: 'translationSettingsFailed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return this.publish();
    }
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
        message.type === 'saveAI' ||
        message.type === 'testAI' ||
        message.type === 'forgetAIKey'
      ) {
        this.aiNotice = undefined;
        this.aiResult = undefined;
        try {
          if (message.type === 'saveAI') {
            await this.ai.save(message.config, message.apiKey);
            this.aiNotice = 'AI settings saved.';
          } else if (message.type === 'forgetAIKey') {
            await this.ai.forgetKey();
            this.aiNotice = 'API key removed.';
          } else {
            this.aiAbort = new AbortController();
            this.aiResult = { status: 'checking' };
            await this.publish();
            const key = message.apiKey || (await this.ai.key(message.config));
            const reply = await this.aiClient.test(message.config, key, this.aiAbort.signal);
            this.aiResult = { status: 'passed', message: reply };
          }
        } catch (error) {
          this.aiResult = {
            status: 'failed',
            message: error instanceof Error ? error.message : String(error),
          };
        } finally {
          this.aiAbort = undefined;
        }
      } else if (
        message.type === 'signIn' ||
        message.type === 'signOut' ||
        message.type === 'refreshAccount'
      ) {
        const submissions = this.workspace.submissions;
        if (!submissions) throw new Error(t('Submission client is unavailable.'));
        if (message.type === 'signIn') {
          try {
            await submissions.signIn();
          } catch {
            /* Shared account state displays login failures in the account card. */
          }
        } else if (message.type === 'signOut') await submissions.signOut();
        else await submissions.refreshAccount();
      } else if (message.type === 'setLocale') {
        await vscode.workspace
          .getConfiguration('codeforcesWorkbench')
          .update('ui.language', message.locale, vscode.ConfigurationTarget.Global);
      } else if (message.type === 'saveSettings') {
        const account = this.workspace.submissions?.accountState;
        if (account?.status === 'signedIn' && account.handle)
          message.values.handle = account.handle;
        if (!vscode.workspace.isTrusted)
          throw new Error('Trust this workspace before changing execution settings.');
        if (message.scope !== this.scope)
          throw new Error('Settings scope changed. Reload settings and retry.');
        if (this.scope === 'workspace' && !this.workspaceAvailable())
          throw new Error('Open a folder in VS Code first.');
        const config = vscode.workspace.getConfiguration('codeforcesWorkbench');
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
        const config = vscode.workspace.getConfiguration('codeforcesWorkbench');
        const before = this.executionFingerprint();
        const selected = message.type === 'checkAllEnvironments' ? languageIds : [message.language];
        for (const language of selected) {
          const command = languageRunConfig(language, config).command;
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
    const config = vscode.workspace.getConfiguration('codeforcesWorkbench');
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
    const account = this.workspace.submissions?.accountState;
    if (account?.status === 'signedIn' && account.handle) values.handle = account.handle;
    const defaultTemplates = { cpp: '', python: '', java: '', kotlin: '' };
    const templatePreviews = { cpp: '', python: '', java: '', kotlin: '' };
    const templateWarnings: SettingsState['templateWarnings'] = {};
    for (const language of languageIds) {
      const bundled = path.join(
        this.context.extensionPath,
        'resources',
        'templates',
        languages[language].template,
      );
      defaultTemplates[language] = await readSourceTemplate({ bundled });
      try {
        templatePreviews[language] = await readSourceTemplate({
          code: values[`${language}TemplateCode`],
          file: vscode.workspace.isTrusted ? values[`${language}Template`] : undefined,
          bundled,
        });
      } catch {
        templatePreviews[language] = defaultTemplates[language];
        templateWarnings[language] = true;
      }
    }
    const state: SettingsState = {
      translationOptions: this.ai.translationOptions(),
      assistanceOptions: this.ai.assistanceOptions(),
      aiCacheOptions: this.ai.cacheOptions(),
      ai: { ...(await this.ai.state()), result: this.aiResult, notice: this.aiNotice },
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
    this.aiAbort?.abort();
    this.panel?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
