import { renderTranslationPrompt } from '../shared/ai-protocol';
import { AiSettings } from './ai-settings';
import { AiClient } from '../infrastructure/ai/client';
import { sanitizeTranslation } from '../infrastructure/ai/translation';
import * as vscode from 'vscode';
import path from 'node:path';
import { CfToolClient, cfToolExecutable } from '../infrastructure/codeforces/cf-tool-client';
import * as cheerio from 'cheerio';
import {
  parseContestId,
  parseProblemReference,
  newestImportedFirst,
  maxDownloadAttempts,
  type ContestRecord,
} from '../domain/contest';
import type { Language, Problem } from '../domain/models';
import { CodeforcesApi } from '../infrastructure/codeforces/api-client';
import { RequestQueue } from '../infrastructure/codeforces/request-queue';
import { CodeforcesWorkspaces, type CodeforcesCollection } from './codeforces-workspaces';
import {
  contestRequestSchema,
  type ContestHostMessage,
  type ContestViewState,
} from '../shared/contest-protocol';
import { SubmissionController } from './submission-controller';
import { WorkspaceController } from './workspace-controller';
import { webviewHtml } from './webview-html';
import { postLocale, t } from './localization';

type Node = { kind: 'contest'; record: ContestRecord };
export class ContestController implements vscode.Disposable, vscode.TreeDataProvider<Node> {
  private ai!: AiSettings;
  private queue = new RequestQueue();
  private api: CodeforcesApi;
  private cfTool: CfToolClient;
  private initialized: Promise<void>;
  private workspaces: CodeforcesWorkspaces;
  private dashboard?: vscode.WebviewPanel;
  private dashboardMode: 'overview' | 'statement' = 'overview';
  private statementPanel?: vscode.WebviewPanel;
  private statementTarget?: {
    contestId: number;
    index: string;
    statement: import('../domain/contest').Statement;
    language: Language;
    problems: { index: string; name: string }[];
    collection: CodeforcesCollection;
    translation?: { status: 'pending' | 'ready' | 'failed'; html?: string; error?: string };
  };
  private selectedId?: number;
  private rankMode: 'all' | 'nearby' | 'search' = 'all';
  private rankSearch = '';
  private busy?: string;
  private errorMessage?: string;
  private section: 'prepare' | 'submissions' | 'rankings' = 'prepare';
  private backgroundErrors = new Map<string, string>();
  private readonly diagnostics = vscode.window.createOutputChannel('AC-Stride · Codeforces');
  private changes = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changes.event;
  private disposables: vscode.Disposable[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private pollBusy = false;
  private lastStatus = new Map<number, number>();
  private lastBoard = 0;
  private pendingContests = new Set<number>();
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  constructor(
    private context: vscode.ExtensionContext,
    private workspace: WorkspaceController,
    private aiClient = new AiClient(),
  ) {
    const executable = cfToolExecutable(context.extensionUri.fsPath);
    this.cfTool = new CfToolClient(executable, undefined, (code) => {
      if (code === 'tool_unavailable' || code === 'protocol_mismatch')
        return t('The bundled Codeforces tool is unavailable. Reinstall the VSIX for this system.');
      if (code === 'verification_required')
        return t(
          'Codeforces requires site verification. Use the official website and retry later.',
        );
      return t('Codeforces connection failed ({code}). Cached data is retained.', { code });
    });
    const submissions = new SubmissionController(context, this.cfTool);
    workspace.submissions = submissions;
    this.disposables.push(submissions.onAccountChanged(() => workspace.publishAccount()));
    workspace.submitHandler = (snapshot) => submissions.submit(snapshot);
    this.disposables.push(
      submissions,
      vscode.commands.registerCommand('cfide.signIn', async () => {
        await vscode.commands.executeCommand('cfide.openSettings', 'environment');
        try {
          await submissions.signIn();
        } catch {
          /* Account card owns login errors. */
        }
      }),
      vscode.commands.registerCommand('cfide.signOut', () =>
        submissions.signOut().catch((e) => this.report(e)),
      ),
    );
    this.ai = new AiSettings(context);
    this.api = new CodeforcesApi(this.queue, (method, params) => this.cfTool.call(method, params));
    this.workspaces = new CodeforcesWorkspaces(
      () => workspace.localStore().root,
      this.api,
      {
        problem: (id, index, assetsDir) =>
          this.queue.schedule(() => this.cfTool.problem(id, index, assetsDir)),
      },
      (language, index) => workspace.template(language, index),
      (id, collection) => {
        void this.changed(id, collection);
      },
      (id, index, statement) => {
        if (this.ai.translationOptions().enabled && this.ai.translationOptions().autoTranslate)
          void this.translate(statement).catch(() => {});
      },
    );
    this.initialized = this.cfTool.ready().catch(() => {
      // Report installation errors on operations while allowing local/cached work.
    });
    this.selectedId = context.workspaceState.get<number>('cfide.selectedContest');
  }
  private trust() {
    if (!vscode.workspace.isTrusted)
      throw new Error('Trust this workspace before downloading or changing local contest files.');
  }
  private runtime(collection: CodeforcesCollection = 'contest') {
    return this.workspaces.get(collection);
  }
  register() {
    const command = (name: string, fn: (...args: any[]) => unknown) =>
      this.disposables.push(
        vscode.commands.registerCommand(name, async (...args) => {
          try {
            await this.initialized;
            await fn(...args);
          } catch (error) {
            this.report(error);
          }
        }),
      );
    command('cfide.openContestCenter', (node?: Node) =>
      this.openCenter(node?.kind === 'contest' ? node.record.contest.id : undefined),
    );
    command('cfide.addContest', () => this.add());
    command('cfide.addCodeforcesProblem', () => this.addStandalone());
    command('cfide.openCodeforcesProblem', (problem: Problem) =>
      this.openProblem(problem.contestId!, problem.id, 'standalone'),
    );
    this.status.command = 'cfide.openContestCenter';
    this.disposables.push(
      this.changes,
      this.diagnostics,
      this.status,
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('cfide.ui.language')) {
          if (this.dashboard) void this.publish();
          postLocale(this.dashboard?.webview);
          postLocale(this.statementPanel?.webview);
          const target = this.statementTarget;
          if (target && (target.collection === 'contest' ? this.dashboard : this.statementPanel))
            void this.openStatement(target.contestId, target.index, false, target.collection).catch(
              (e) => this.report(e),
            );
          this.changes.fire(undefined);
        }
        if (event.affectsConfiguration('cfide.codeforces.handle')) {
          this.lastStatus.clear();
          this.pendingContests.clear();
          this.backgroundErrors.clear();
          this.lastBoard = 0;
        }
        if (event.affectsConfiguration('cfide')) void this.publish();
      }),
    );
    this.workspace.resolveSource = async (source) => {
      for (const collection of ['contest', 'standalone'] as const) {
        const { repo } = this.runtime(collection);
        for (const record of await repo.list()) {
          const store = repo.problems(record.contest.id);
          for (const problem of await store.listProblems())
            for (const language of ['cpp', 'python'] as const)
              if (store.sourcePath(problem.id, language) === source)
                return { store, problem: { ...problem, language } };
        }
      }
      return undefined;
    };
    this.workspace.onProblemOpened = async (_store, problem) => {
      if (problem.contestId) {
        const collection = problem.collection ?? 'contest';
        if (collection === 'contest') await this.select(problem.contestId);
        await this.openStatement(problem.contestId, problem.id, true, collection);
        void this.runtime(collection)
          .service.ensureDownloaded(problem.contestId, problem.id)
          .catch((error) => this.report(error));
      } else {
        this.statementPanel?.dispose();
        this.statementTarget = undefined;
      }
    };
    this.timers.push(
      setInterval(() => {
        if (!vscode.workspace.isTrusted) return;
        try {
          const { service } = this.runtime();
          void service.tick(Date.now()).catch(() => {});
          void this.runtime('standalone')
            .service.tick(Date.now())
            .catch(() => {});
        } catch {
          /* No open workspace. */
        }
        void this.poll().catch((error) => {
          this.diagnostics.appendLine(
            `Background refresh: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }, 5000),
    );
    this.timers.push(setInterval(() => void this.updateCountdown(), 1000));
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.workspaces.dispose();
        this.selectedId = undefined;
        this.section = 'prepare';
        this.backgroundErrors.clear();
        this.dashboard?.dispose();
        this.statementPanel?.dispose();
        this.changes.fire(undefined);
      }),
    );
    void this.initialized.then(async () => {
      if (!vscode.workspace.isTrusted) return;
      try {
        const { repo, service } = this.runtime();
        for (const record of await repo.list()) {
          if (record.archived) continue;
          const handle = this.handle();
          const cached = handle ? await repo.submissions(record.contest.id, handle) : undefined;
          if (
            cached?.submissions.some(
              (s) => !s.verdict || ['TESTING', 'SUBMITTED'].includes(s.verdict),
            )
          )
            this.pendingContests.add(record.contest.id);
        }
        void service.tick(Date.now()).catch(() => {});
        await this.workspace.restoreLast();
      } catch {
        /* Empty/new workspaces need no restoration. */
      }
    });
  }
  private handle() {
    return (
      vscode.workspace.getConfiguration('cfide').get<string>('codeforces.handle', '').trim() ||
      undefined
    );
  }
  private async changed(id: number, collection: CodeforcesCollection = 'contest') {
    this.changes.fire(undefined);
    const target = this.statementTarget;
    if (
      target?.contestId === id &&
      target.collection === collection &&
      (collection === 'contest' ? this.dashboard : this.statementPanel)
    ) {
      const repo = this.runtime(collection).repo;
      const [cached, record] = await Promise.all([repo.statement(id, target.index), repo.get(id)]);
      const statement =
        cached || this.pendingStatement(record.problems.find((p) => p.index === target.index));
      if (
        target === this.statementTarget &&
        (statement.fetchedAt !== target.statement.fetchedAt ||
          statement.html !== target.statement.html)
      ) {
        const newlyDownloaded = !!cached && statement.fetchedAt !== target.statement.fetchedAt;
        target.statement = statement;
        target.translation = undefined;
        void (collection === 'contest' ? this.dashboard : this.statementPanel)?.webview.postMessage(
          {
            type: 'statement',
            ...target,
            statement: this.mapAssets(id, statement, collection),
          } satisfies ContestHostMessage,
        );
        if (newlyDownloaded)
          await this.workspace.refreshTests(
            id,
            target.index,
            collection === 'standalone' ? 'standalone' : undefined,
          );
      }
    }
    if (collection === 'contest' && id === this.selectedId) await this.publish();
  }
  async getChildren(node?: Node): Promise<Node[]> {
    try {
      if (node) return [];
      return newestImportedFirst(await this.runtime().repo.list()).map((record) => ({
        kind: 'contest',
        record,
      }));
    } catch {
      return [];
    }
  }
  getTreeItem(node: Node): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.record.contest.name,
      vscode.TreeItemCollapsibleState.None,
    );
    item.id = `contest:${node.record.contest.id}`;
    item.description = node.record.archived ? t('Archived') : t(node.record.contest.phase);
    item.tooltip = t('Contest {id}\n{detail}', {
      id: node.record.contest.id,
      detail: t(node.record.error ?? 'Open Contest Center for preparation and standings.'),
    });
    item.iconPath = new vscode.ThemeIcon(node.record.archived ? 'archive' : 'trophy');
    item.command = {
      command: 'cfide.openContestCenter',
      title: t('Contest Center'),
      arguments: [node],
    };
    return item;
  }
  async standaloneProblems(): Promise<Problem[]> {
    const { repo } = this.runtime('standalone');
    const groups = await Promise.all(
      (await repo.list()).map((r) => repo.problems(r.contest.id).listProblems()),
    );
    return newestImportedFirst(groups.flat());
  }
  private async addStandalone() {
    this.trust();
    const input = await vscode.window.showInputBox({
      title: t('Import Codeforces problem'),
      prompt: t('Problem URL or ID, for example 2261A'),
      validateInput: (text) => {
        try {
          parseProblemReference(text);
          return null;
        } catch (error) {
          return t((error as Error).message);
        }
      },
    });
    if (!input) return;
    const { contestId, index } = parseProblemReference(input);
    const { service } = this.runtime('standalone');
    await service.addProblem(contestId, index, this.workspace.defaultLanguage());
    await this.openProblem(contestId, index, 'standalone');
  }
  private async add() {
    this.trust();
    const input = await vscode.window.showInputBox({
      title: t('Add Codeforces contest'),
      prompt: t('Contest URL or contest ID (not the round number)'),
      validateInput: (value) => {
        try {
          parseContestId(value);
          return null;
        } catch (error) {
          return t((error as Error).message);
        }
      },
    });
    if (!input) return;
    const language = this.workspace.defaultLanguage();
    await this.task(t('Looking up contest…'), async () => {
      const { service } = this.runtime();
      const id = parseContestId(input);
      await service.add(id, language);
      await this.openCenter(id);
      void service.sync(id).catch((error) => this.report(error));
    });
  }
  private async select(id: number) {
    await this.runtime().repo.get(id);
    if (this.selectedId !== id) {
      this.errorMessage = undefined;
      this.lastBoard = 0;
    }
    this.selectedId = id;
    await this.context.workspaceState.update('cfide.selectedContest', id);
    await this.publish();
  }
  private async openCenter(id?: number) {
    this.dashboardMode = 'overview';
    this.section = 'rankings';
    if (id) await this.select(id);
    if (!this.dashboard) {
      this.dashboard = vscode.window.createWebviewPanel(
        'cfide.contestCenter',
        t('AC-Stride · Contest Center'),
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')],
        },
      );
      this.dashboard.webview.html = webviewHtml(
        this.dashboard.webview,
        this.context.extensionUri,
        'contest',
      );
      this.dashboard.onDidDispose(
        () => {
          this.dashboard = undefined;
        },
        null,
        this.disposables,
      );
      this.dashboard.webview.onDidReceiveMessage(
        (raw) => {
          const parsed = contestRequestSchema.safeParse(raw);
          if (!parsed.success) {
            this.report(new Error('Invalid contest request.'));
            return;
          }
          void this.handleMessage(parsed.data).catch((error) => this.report(error));
        },
        null,
        this.disposables,
      );
    } else this.dashboard.reveal(vscode.ViewColumn.One);
    if (this.dashboard) {
      const record = this.selectedId ? await this.runtime().repo.get(this.selectedId) : undefined;
      this.dashboard.title = record?.contest.name ?? t('AC-Stride · Contest Center');
      void this.dashboard.webview.postMessage({ type: 'contestOverview' });
    }
    await this.publish();
  }
  private async handleMessage(message: import('zod').infer<typeof contestRequestSchema>) {
    await this.initialized;
    if (message.type === 'ready') {
      await this.publish();
      if (
        this.dashboardMode === 'statement' &&
        this.statementTarget?.collection === 'contest' &&
        this.dashboard
      )
        void this.dashboard.webview.postMessage({
          type: 'statement',
          ...this.statementTarget,
          statement: this.mapAssets(this.statementTarget.contestId, this.statementTarget.statement),
        });
      return;
    }
    if (message.type === 'translateStatement') return this.showTranslation(message);
    if (message.type === 'openContestDetails') return this.openCenter(message.contestId);
    if (message.type === 'contestSection') {
      this.section = message.section;
      if (message.section === 'rankings') this.lastBoard = 0;
      await this.publish();
      void this.poll().catch((error) => this.report(error, false));
      return;
    }
    if (message.type === 'addContest') return this.add();
    if (message.type === 'openSettings')
      return vscode.commands.executeCommand('cfide.openSettings');
    if (message.type === 'rankFilter') {
      this.rankMode = message.mode;
      this.rankSearch = message.search;
      return this.publish();
    }
    if (message.type === 'selectContest') return this.select(message.contestId);
    if (message.type === 'switchLanguage')
      return vscode.commands.executeCommand('cfide.switchLanguage');
    this.trust();
    const { repo, service } = this.runtime();
    await repo.get(message.contestId);
    if (message.type === 'openProblem')
      return this.openProblem(message.contestId, message.index, message.collection ?? 'contest');
    if (message.type === 'refreshStatus')
      return this.task(t('Refreshing submissions…'), () => this.refreshStatus(message.contestId));
    if (message.type === 'refreshStandings')
      return this.task(t('Refreshing official rankings…'), async () => {
        await service.refreshBoard(message.contestId);
        this.backgroundErrors.delete(`${message.contestId}/rankings`);
      });
  }
  private async openProblem(
    id: number,
    index: string,
    collection: CodeforcesCollection = 'contest',
  ) {
    this.trust();
    const { repo, service } = this.runtime(collection);
    const problem = await service.ensureSolution(id, index);
    await this.workspace.openInStore(repo.problems(id), problem);
  }
  private pendingStatement(item?: {
    downloadAttempts: number;
  }): import('../domain/contest').Statement {
    const failed =
      !!item && item.downloadAttempts >= maxDownloadAttempts && !!('error' in item && item.error);
    const title = failed
      ? t('Problem download failed after multiple attempts.')
      : t('Downloading problem, please wait…');
    return {
      title,
      html: `<h2>${title}</h2><p>${t('You can keep coding and add custom tests while the statement is unavailable.')}</p>`,
      timeLimit: '',
      memoryLimit: '',
      fetchedAt: 0,
    };
  }
  private async openStatement(
    id: number,
    index: string,
    reveal = true,
    collection: CodeforcesCollection = 'contest',
  ) {
    const repo = this.runtime(collection).repo;
    const record = await repo.get(id);
    const cached = await repo.statement(id, index);
    const item = record.problems.find((p) => p.index === index);
    const statement = cached || this.pendingStatement(item);
    const language = this.workspace.active()?.problem.language ?? record.defaultLanguage;
    const problems = record.problems.map(({ index, name }) => ({ index, name }));
    this.statementTarget = { contestId: id, index, statement, language, problems, collection };
    if (collection === 'contest') {
      if (!this.dashboard) await this.openCenter(id);
      else if (this.selectedId !== id) await this.select(id);
      this.dashboardMode = 'statement';
      this.section = 'prepare';
      if (this.dashboard) {
        this.dashboard.title = record.contest.name;
        this.dashboard.webview.options = {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
            vscode.Uri.file(repo.assets(id)),
          ],
        };
        if (reveal) this.dashboard.reveal(vscode.ViewColumn.One, true);
        void this.dashboard.webview.postMessage({
          type: 'statement',
          ...this.statementTarget,
          statement: this.mapAssets(id, statement, collection),
        });
      }
      await this.publish();
      return;
    }
    if (!this.statementPanel) {
      this.statementPanel = vscode.window.createWebviewPanel(
        'cfide.statement',
        t('AC-Stride · Statement'),
        { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')],
        },
      );
      this.statementPanel.webview.html = webviewHtml(
        this.statementPanel.webview,
        this.context.extensionUri,
        'statement',
      );
      this.statementPanel.onDidDispose(
        () => {
          this.statementPanel = undefined;
        },
        null,
        this.disposables,
      );
      this.statementPanel.webview.onDidReceiveMessage(
        async (raw) => {
          const parsed = contestRequestSchema.safeParse(raw);
          if (!parsed.success) return;
          if (parsed.data.type !== 'ready') {
            const message = parsed.data;
            const collection =
              message.type === 'openProblem'
                ? (message.collection ?? 'contest')
                : (this.statementTarget?.collection ?? 'contest');
            if (message.type === 'openProblem')
              await this.openProblem(message.contestId, message.index, collection).catch((e) =>
                this.report(e),
              );
            else if (message.type === 'openContestDetails')
              await this.openCenter(message.contestId).catch((e) => this.report(e));
            else if (message.type === 'translateStatement') await this.showTranslation(message);
            else if (message.type === 'switchLanguage')
              await this.handleMessage(message).catch((e) => this.report(e));
            return;
          }
          if (this.statementTarget) {
            postLocale(this.statementPanel?.webview);
            const target = this.statementTarget;
            if (this.statementPanel)
              void this.statementPanel.webview.postMessage({
                type: 'statement',
                ...target,
                statement: this.mapAssets(target.contestId, target.statement, target.collection),
              } satisfies ContestHostMessage);
          }
        },
        null,
        this.disposables,
      );
    } else if (reveal) this.statementPanel.reveal(vscode.ViewColumn.One, true);
    this.statementPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        vscode.Uri.file(this.runtime(collection).repo.assets(id)),
      ],
    };
    this.statementPanel.title = `${id} · ${index} · ${t('STATEMENT')}`;
    postLocale(this.statementPanel.webview);
    void this.statementPanel.webview.postMessage({
      type: 'statement',
      contestId: id,
      index,
      language,
      collection,
      problems,
      statement: this.mapAssets(id, statement, collection),
    } satisfies ContestHostMessage);
  }
  private async translate(statement: import('../domain/contest').Statement) {
    const options = this.ai.translationOptions(),
      config = this.ai.config();
    const output = await this.aiClient.complete(
      config,
      await this.ai.key(config),
      [
        { role: 'system', content: renderTranslationPrompt(options) },
        { role: 'user', content: statement.html },
      ],
      undefined,
      120000,
    );
    return sanitizeTranslation(output, statement.html);
  }
  private async showTranslation(request: {
    contestId: number;
    index: string;
    collection?: CodeforcesCollection;
  }) {
    let target = this.statementTarget;
    if (
      !target ||
      target.contestId !== request.contestId ||
      target.index !== request.index ||
      target.collection !== (request.collection ?? 'contest')
    ) {
      await this.openStatement(
        request.contestId,
        request.index,
        false,
        request.collection ?? 'contest',
      );
      target = this.statementTarget;
    }
    if (!target) return;
    if (!this.ai.translationOptions().enabled) {
      void (
        target.collection === 'contest' ? this.dashboard : this.statementPanel
      )?.webview.postMessage({ type: 'translation', status: 'disabled' });
      await vscode.commands.executeCommand('cfide.openSettings', 'assistance');
      return;
    }
    if (!target.statement.fetchedAt) return;
    const pending = { status: 'pending' as const };
    target.translation = pending;
    this.postTranslation(target);
    try {
      const html = await this.translate(target.statement);
      if (target.translation !== pending) return;
      target.translation = { status: 'ready', html };
    } catch (error) {
      if (target.translation !== pending) return;
      target.translation = {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (target === this.statementTarget) this.postTranslation(target);
  }
  private postTranslation(target: NonNullable<ContestController['statementTarget']>) {
    const panel = target.collection === 'contest' ? this.dashboard : this.statementPanel;
    const translation = target.translation;
    void panel?.webview.postMessage({
      type: 'translation',
      ...translation,
      html: translation?.html
        ? this.mapAssets(
            target.contestId,
            { ...target.statement, html: translation.html },
            target.collection,
          ).html
        : undefined,
    });
  }
  private mapAssets(
    id: number,
    statement: import('../domain/contest').Statement,
    collection: CodeforcesCollection = 'contest',
  ) {
    const $ = cheerio.load(statement.html, undefined, false);
    $('img').each((_, node) => {
      const src = $(node).attr('src') || '';
      if (
        /^cfide-asset:[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(src) &&
        (collection === 'contest' ? this.dashboard : this.statementPanel)
      )
        $(node).attr(
          'src',
          (collection === 'contest' ? this.dashboard! : this.statementPanel!).webview
            .asWebviewUri(
              vscode.Uri.file(
                path.join(
                  this.runtime(collection).repo.assets(id),
                  src.slice('cfide-asset:'.length),
                ),
              ),
            )
            .toString(),
        );
      else $(node).removeAttr('src');
    });
    return { ...statement, html: $.html() };
  }
  private async refreshStatus(id: number) {
    const handle = this.handle();
    if (!handle) throw new Error('Set a public read-only handle first.');
    await this.runtime().service.refreshSubmissions(id, handle);
    this.backgroundErrors.delete(`${id}/submissions`);
  }
  private backgroundFailure(id: number, section: 'submissions' | 'rankings', error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    this.diagnostics.appendLine(
      `${new Date().toISOString()} contest=${id} operation=${section}: ${detail}`,
    );
    this.backgroundErrors.set(
      `${id}/${section}`,
      section === 'rankings'
        ? 'Rankings could not be refreshed. Cached data is shown; automatic retries will continue.'
        : 'Submissions could not be refreshed. Cached data is shown; automatic retries will continue.',
    );
  }
  private async poll() {
    if (this.pollBusy || !vscode.workspace.isTrusted) return;
    await this.initialized;
    const handle = this.handle();
    const { service, repo } = this.runtime();
    const ids = new Set(this.pendingContests);
    if (
      this.selectedId &&
      (this.dashboard?.visible || this.workspace.active()?.problem.contestId === this.selectedId)
    )
      ids.add(this.selectedId);
    this.pollBusy = true;
    try {
      for (const id of ids) {
        const record = await repo.get(id);
        if (record.archived) continue;
        const interval = this.pendingContests.has(id) ? Math.max(5000, ids.size * 3000) : 30000;
        if (handle && Date.now() - (this.lastStatus.get(id) ?? 0) >= interval) {
          this.lastStatus.set(id, Date.now());
          try {
            await service.refreshSubmissions(id, handle);
            this.backgroundErrors.delete(`${id}/submissions`);
            const cached = await repo.submissions(id, handle);
            if (
              !cached.submissions.some(
                (s) => !s.verdict || ['TESTING', 'SUBMITTED'].includes(s.verdict),
              )
            )
              this.pendingContests.delete(id);
          } catch (error) {
            this.lastStatus.set(id, Date.now() + 10000);
            this.backgroundFailure(id, 'submissions', error);
          }
        }
      }
      if (
        this.selectedId &&
        this.dashboard?.visible &&
        this.section === 'rankings' &&
        Date.now() - this.lastBoard > 30000
      ) {
        this.lastBoard = Date.now();
        const id = this.selectedId;
        const record = await repo.get(id);
        if (!record.archived && record.contest.phase !== 'BEFORE') {
          try {
            await service.refreshBoard(id);
            this.backgroundErrors.delete(`${id}/rankings`);
          } catch (error) {
            this.backgroundFailure(id, 'rankings', error);
          }
        }
      }
    } finally {
      this.pollBusy = false;
      await this.publish();
    }
  }
  private async publish() {
    if (!this.dashboard) return;
    postLocale(this.dashboard.webview);
    try {
      const { repo } = this.runtime(),
        selected = this.selectedId;
      const contests = await repo.list();
      if (this.dashboard)
        this.dashboard.title =
          contests.find((c) => c.contest.id === selected)?.contest.name ??
          t('AC-Stride · Contest Center');
      const handle = this.handle();
      const status =
        selected && handle
          ? await repo.submissions(selected, handle)
          : { submissions: [], fetchedAt: 0 };
      const board = selected ? await repo.standings(selected) : null;
      let rows = board?.rows ?? [];
      if (this.rankMode === 'nearby') {
        const i = rows.findIndex((r) =>
          r.handles.some((h) => h.toLowerCase() === handle?.toLowerCase()),
        );
        rows = i >= 0 ? rows.slice(Math.max(0, i - 20), i + 21) : [];
      } else if (this.rankMode === 'search')
        rows = rows.filter((r) =>
          r.handles.some((h) => h.toLowerCase().includes(this.rankSearch.toLowerCase())),
        );
      const state: ContestViewState = {
        contests,
        section: this.section,
        refreshNotice: this.backgroundErrors.get(`${selected}/${this.section}`),
        selectedId: selected,
        watchHandle: handle,
        submissions: status.submissions,
        submissionsUpdatedAt: status.fetchedAt,
        rows: rows.slice(0, 100),
        rankProblemIndices: board?.problems.map((p) => p.index) ?? [],
        rankTotal: board?.rows.length ?? 0,
        rankingsUpdatedAt: board?.fetchedAt ?? 0,
        rankMode: this.rankMode,
        busy: this.busy,
        error: this.errorMessage,
        serverNow: Date.now(),
      };
      if (selected !== this.selectedId || repo !== this.runtime().repo) return;
      void this.dashboard?.webview.postMessage({
        type: 'contestState',
        state,
      } satisfies ContestHostMessage);
    } catch (error) {
      this.report(error, false);
    }
  }
  private async task(label: string, fn: () => Promise<unknown>) {
    if (this.busy) throw new Error('Another contest operation is in progress.');
    this.busy = label;
    this.errorMessage = undefined;
    await this.publish();
    try {
      await fn();
    } finally {
      this.busy = undefined;
      await this.publish();
    }
  }
  private report(error: unknown, notify = true) {
    this.errorMessage = error instanceof Error ? error.message : String(error);
    if (notify) void vscode.window.showErrorMessage('AC-Stride: ' + t(this.errorMessage));
    if (notify) void this.publish();
  }
  private async updateCountdown() {
    if (!this.selectedId) {
      this.status.hide();
      return;
    }
    try {
      const record = await this.runtime().repo.get(this.selectedId),
        c = record.contest;
      const now = Math.floor(Date.now() / 1000),
        start = c.startTimeSeconds;
      const remaining = start
        ? now < start
          ? start - now
          : Math.max(0, start + c.durationSeconds - now)
        : 0;
      const time = `${Math.floor(remaining / 3600)}:${String(Math.floor(remaining / 60) % 60).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
      this.status.text = `$(trophy) CF ${c.id} · ${t(start && now < start ? 'Starts in' : 'Remaining')} ${time}`;
      this.status.tooltip = c.name + '\n' + t(c.phase);
      this.status.show();
    } catch {
      this.status.hide();
    }
  }
  dispose() {
    this.cfTool.dispose();
    this.workspaces.dispose();
    this.queue.dispose();
    this.timers.forEach(clearInterval);
    this.dashboard?.dispose();
    this.statementPanel?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
