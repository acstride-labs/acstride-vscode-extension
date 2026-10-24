import * as vscode from 'vscode';
import path from 'node:path';
import { CfToolClient, cfToolExecutable } from '../infrastructure/codeforces/cf-tool-client';
import * as cheerio from 'cheerio';
import { parseContestId, maxDownloadAttempts, type ContestRecord } from '../domain/contest';
import type { Language, Problem } from '../domain/models';
import { languages } from '../domain/languages';
import { CodeforcesApi } from '../infrastructure/codeforces/api-client';
import { RequestQueue } from '../infrastructure/codeforces/request-queue';
import { ContestRepository } from '../infrastructure/storage/contest-repository';
import { ContestService } from '../application/contest-service';
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
  private queue = new RequestQueue();
  private api: CodeforcesApi;
  private cfTool: CfToolClient;
  private initialized: Promise<void>;
  private service?: ContestService;
  private repo?: ContestRepository;
  private dashboard?: vscode.WebviewPanel;
  private statementPanel?: vscode.WebviewPanel;
  private statementTarget?: {
    contestId: number;
    index: string;
    statement: import('../domain/contest').Statement;
    language: Language;
    problems: { index: string; name: string }[];
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
      vscode.commands.registerCommand('cfide.signIn', () =>
        submissions.signIn().catch((e) => this.report(e)),
      ),
      vscode.commands.registerCommand('cfide.signOut', () =>
        submissions.signOut().catch((e) => this.report(e)),
      ),
    );
    this.api = new CodeforcesApi(this.queue, (method, params) => this.cfTool.call(method, params));
    this.initialized = this.cfTool.ready().catch(() => {
      // Report installation errors on operations while allowing local/cached work.
    });
    this.selectedId = context.workspaceState.get<number>('cfide.selectedContest');
  }
  private trust() {
    if (!vscode.workspace.isTrusted)
      throw new Error('Trust this workspace before downloading or changing local contest files.');
  }
  private runtime() {
    const root = this.workspace.localStore().root;
    if (this.repo?.root !== root) {
      this.service?.dispose();
      this.repo = new ContestRepository(root);
      const repository = this.repo;
      this.service = new ContestService(
        repository,
        this.api,
        {
          problem: (id, index, assetsDir) =>
            this.queue.schedule(() => this.cfTool.problem(id, index, assetsDir)),
        },
        (language, index) => this.workspace.template(language, index),
        (id) => this.changed(id),
      );
      this.lastStatus.clear();
      this.pendingContests.clear();
      this.lastBoard = 0;
    }
    return { repo: this.repo!, service: this.service! };
  }
  register() {
    const tree = vscode.window.createTreeView('cfide.contests', { treeDataProvider: this });
    tree.title = t('Codeforces Contests');
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
    this.status.command = 'cfide.openContestCenter';
    this.disposables.push(
      this.changes,
      this.diagnostics,
      this.status,
      tree,
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('cfide.ui.language')) {
          tree.title = t('Codeforces Contests');
          if (this.dashboard) this.dashboard.title = t('AC-Stride · Contest Center');
          postLocale(this.dashboard?.webview);
          postLocale(this.statementPanel?.webview);
          const target = this.statementTarget;
          if (target && this.statementPanel)
            void this.openStatement(target.contestId, target.index, false).catch((e) =>
              this.report(e),
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
      const { repo } = this.runtime();
      for (const record of await repo.list()) {
        const store = repo.problems(record.contest.id);
        for (const problem of await store.listProblems())
          for (const language of ['cpp', 'python'] as const)
            if (store.sourcePath(problem.id, language) === source)
              return { store, problem: { ...problem, language } };
      }
      return undefined;
    };
    this.workspace.onProblemOpened = async (_store, problem) => {
      if (problem.contestId) {
        await this.select(problem.contestId);
        await this.openStatement(problem.contestId, problem.id);
        void this.runtime()
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
        this.service?.dispose();
        this.repo = undefined;
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
  private async changed(id: number) {
    this.changes.fire(undefined);
    const target = this.statementTarget;
    if (target?.contestId === id && this.statementPanel) {
      const repo = this.runtime().repo;
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
        void this.statementPanel?.webview.postMessage({
          type: 'statement',
          ...target,
          statement: this.mapAssets(id, statement),
        } satisfies ContestHostMessage);
        if (newlyDownloaded) await this.workspace.refreshTests(id, target.index);
      }
    }
    if (id === this.selectedId) await this.publish();
  }
  async getChildren(node?: Node): Promise<Node[]> {
    try {
      if (node) return [];
      return (await this.runtime().repo.list())
        .sort(
          (a, b) =>
            Number(a.archived) - Number(b.archived) ||
            phaseOrder(a) - phaseOrder(b) ||
            (b.contest.startTimeSeconds ?? 0) - (a.contest.startTimeSeconds ?? 0),
        )
        .map((record) => ({ kind: 'contest', record }));
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
    const language = await vscode.window.showQuickPick(
      [
        { label: 'C++', value: 'cpp' as const },
        { label: 'Python 3', value: 'python' as const },
      ],
      { title: t('Default solution language for this contest') },
    );
    if (!language) return;
    await this.task(t('Looking up contest…'), async () => {
      const { service } = this.runtime();
      const id = parseContestId(input);
      await service.add(id, language.value);
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
    this.section = 'prepare';
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
    await this.publish();
  }
  private async handleMessage(message: import('zod').infer<typeof contestRequestSchema>) {
    await this.initialized;
    if (message.type === 'ready') return this.publish();
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
    if (message.type === 'openProblem') return this.openProblem(message.contestId, message.index);
    if (message.type === 'refreshStatus')
      return this.task(t('Refreshing submissions…'), () => this.refreshStatus(message.contestId));
    if (message.type === 'refreshStandings')
      return this.task(t('Refreshing official rankings…'), async () => {
        await service.refreshBoard(message.contestId);
        this.backgroundErrors.delete(`${message.contestId}/rankings`);
      });
  }
  private async openProblem(id: number, index: string) {
    this.trust();
    const { repo, service } = this.runtime();
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
  private async openStatement(id: number, index: string, reveal = true) {
    const repo = this.runtime().repo;
    const record = await repo.get(id);
    const cached = await repo.statement(id, index);
    const item = record.problems.find((p) => p.index === index);
    const statement = cached || this.pendingStatement(item);
    const language = this.workspace.active()?.problem.language ?? record.defaultLanguage;
    const problems = record.problems.map(({ index, name }) => ({ index, name }));
    this.statementTarget = { contestId: id, index, statement, language, problems };
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
            if (['openProblem', 'switchLanguage'].includes(parsed.data.type))
              await this.handleMessage(parsed.data).catch((e) => this.report(e));
            return;
          }
          if (this.statementTarget) {
            postLocale(this.statementPanel?.webview);
            const target = this.statementTarget;
            if (this.statementPanel)
              void this.statementPanel.webview.postMessage({
                type: 'statement',
                ...target,
                statement: this.mapAssets(target.contestId, target.statement),
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
        vscode.Uri.file(this.runtime().repo.assets(id)),
      ],
    };
    this.statementPanel.title = `${id} · ${index} · ${t('STATEMENT')}`;
    postLocale(this.statementPanel.webview);
    void this.statementPanel.webview.postMessage({
      type: 'statement',
      contestId: id,
      index,
      language,
      problems,
      statement: this.mapAssets(id, statement),
    } satisfies ContestHostMessage);
  }
  private mapAssets(id: number, statement: import('../domain/contest').Statement) {
    const $ = cheerio.load(statement.html, undefined, false);
    $('img').each((_, node) => {
      const src = $(node).attr('src') || '';
      if (/^cfide-asset:[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(src) && this.statementPanel)
        $(node).attr(
          'src',
          this.statementPanel.webview
            .asWebviewUri(
              vscode.Uri.file(
                path.join(this.runtime().repo.assets(id), src.slice('cfide-asset:'.length)),
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
      if (selected !== this.selectedId || repo !== this.repo) return;
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
    this.service?.dispose();
    this.queue.dispose();
    this.timers.forEach(clearInterval);
    this.dashboard?.dispose();
    this.statementPanel?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
function phaseOrder(record: ContestRecord) {
  return record.contest.phase === 'CODING' ? 0 : record.contest.phase === 'BEFORE' ? 1 : 2;
}
