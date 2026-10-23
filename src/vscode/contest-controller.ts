import * as vscode from 'vscode';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import {
  parseContestId,
  submissionLabel,
  type ContestRecord,
  type SubmissionAttempt,
} from '../domain/contest';
import type { Language, Problem } from '../domain/models';
import { languages } from '../domain/languages';
import { CodeforcesApi } from '../infrastructure/codeforces/api-client';
import { CodeforcesSession } from '../infrastructure/codeforces/session-client';
import { RequestQueue } from '../infrastructure/codeforces/request-queue';
import { cacheStatementAssets } from '../infrastructure/codeforces/asset-cache';
import { ContestRepository } from '../infrastructure/storage/contest-repository';
import { ContestService } from '../application/contest-service';
import {
  contestRequestSchema,
  type ContestHostMessage,
  type ContestViewState,
} from '../shared/contest-protocol';
import { WorkspaceController } from './workspace-controller';
import { webviewHtml } from './webview-html';

type Node =
  | { kind: 'contest'; record: ContestRecord }
  | {
      kind: 'problem';
      contestId: number;
      index: string;
      name: string;
      ready: boolean;
      error?: string;
    };
export class ContestController implements vscode.Disposable, vscode.TreeDataProvider<Node> {
  private queue = new RequestQueue();
  private api = new CodeforcesApi(this.queue);
  private session: CodeforcesSession;
  private initialized: Promise<void>;
  private service?: ContestService;
  private repo?: ContestRepository;
  private dashboard?: vscode.WebviewPanel;
  private statementPanel?: vscode.WebviewPanel;
  private statementTarget?: { contestId: number; index: string };
  private selectedId?: number;
  private rankMode: 'all' | 'nearby' | 'search' = 'all';
  private rankSearch = '';
  private busy?: string;
  private errorMessage?: string;
  private registrationMessage?: string;
  private announcementsMessage?: string;
  private changes = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changes.event;
  private disposables: vscode.Disposable[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private pollBusy = false;
  private lastStatus = new Map<number, number>();
  private lastBoard = 0;
  private pendingContests = new Set<number>();
  private submitting = false;
  private snapshots = new Map<string, string>();
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  constructor(
    private context: vscode.ExtensionContext,
    private workspace: WorkspaceController,
  ) {
    this.session = new CodeforcesSession(context.secrets, this.queue);
    this.initialized = this.session.restore();
    this.selectedId = context.workspaceState.get<number>('cfide.selectedContest');
  }
  private trust() {
    if (!vscode.workspace.isTrusted)
      throw new Error(
        'Trust this workspace before connecting, downloading, registering or submitting.',
      );
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
        this.session,
        (language, index) => this.workspace.template(language, index),
        (id) => this.changed(id),
        (id, statement) => cacheStatementAssets(statement, repository.assets(id), this.queue),
      );
      this.lastStatus.clear();
      this.pendingContests.clear();
      this.lastBoard = 0;
    }
    return { repo: this.repo!, service: this.service! };
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
    command('cfide.openContestProblem', (node: Node) =>
      node?.kind === 'problem' ? this.openProblem(node.contestId, node.index) : undefined,
    );
    command('cfide.signIn', () => this.login());
    command('cfide.connectCookie', () => this.connectCookie());
    command('cfide.signOut', async () => {
      this.trust();
      await this.session.logout();
      await this.publish();
    });
    command('cfide.submitSolution', () => this.submit());
    this.status.command = 'cfide.openContestCenter';
    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider('cfide-snapshot', {
        provideTextDocumentContent: (uri) => this.snapshots.get(uri.toString()) || '',
      }),
      this.changes,
      this.status,
      vscode.window.registerTreeDataProvider('cfide.contests', this),
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
      } else {
        this.statementPanel?.dispose();
      }
    };
    this.timers.push(
      setInterval(() => {
        if (!vscode.workspace.isTrusted) return;
        try {
          const { service } = this.runtime();
          void service.tick(Date.now() + this.api.clockOffset).catch(() => {});
        } catch {
          /* No open workspace. */
        }
        void this.poll().catch((error) => {
          this.errorMessage = error instanceof Error ? error.message : String(error);
          void this.publish();
        });
      }, 5000),
    );
    this.timers.push(setInterval(() => void this.updateCountdown(), 1000));
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.service?.dispose();
        this.repo = undefined;
        this.selectedId = undefined;
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
            ) ||
            (await repo.attempts(record.contest.id)).some((a) =>
              ['sending', 'prepared', 'uncertain'].includes(a.state),
            )
          )
            this.pendingContests.add(record.contest.id);
        }
        void service.tick(Date.now() + this.api.clockOffset).catch(() => {});
        await this.workspace.restoreLast();
      } catch {
        /* Empty/new workspaces need no restoration. */
      }
    });
  }
  private handle() {
    return (
      this.session.handle ||
      vscode.workspace.getConfiguration('cfide').get<string>('codeforces.handle', '').trim() ||
      undefined
    );
  }
  private async changed(id: number) {
    this.changes.fire(undefined);
    if (id === this.selectedId) await this.publish();
  }
  async getChildren(node?: Node): Promise<Node[]> {
    try {
      if (node?.kind === 'problem') return [];
      if (node)
        return node.record.problems.map((p) => ({
          kind: 'problem',
          contestId: node.record.contest.id,
          index: p.index,
          name: p.name,
          ready: p.ready,
          error: p.error,
        }));
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
    if (node.kind === 'contest') {
      const item = new vscode.TreeItem(
        node.record.contest.name,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.id = `contest:${node.record.contest.id}`;
      item.description = node.record.archived ? 'Archived' : node.record.contest.phase;
      item.tooltip = `Contest ${node.record.contest.id}\n${node.record.error ?? 'Open Contest Center for preparation and standings.'}`;
      item.iconPath = new vscode.ThemeIcon(node.record.archived ? 'archive' : 'trophy');
      item.command = {
        command: 'cfide.openContestCenter',
        title: 'Contest Center',
        arguments: [node],
      };
      return item;
    }
    const item = new vscode.TreeItem(`${node.index} · ${node.name}`);
    item.id = `contest:${node.contestId}/${node.index}`;
    item.description = node.error ? 'Download failed' : node.ready ? 'Ready' : 'Waiting';
    item.iconPath = new vscode.ThemeIcon(node.error ? 'warning' : node.ready ? 'code' : 'clock');
    item.tooltip = node.error || node.name;
    item.command = { command: 'cfide.openContestProblem', title: 'Open', arguments: [node] };
    return item;
  }
  private async add() {
    this.trust();
    const input = await vscode.window.showInputBox({
      title: 'Add Codeforces contest',
      prompt: 'Contest URL or contest ID (not the round number)',
      validateInput: (value) => {
        try {
          parseContestId(value);
          return null;
        } catch (error) {
          return (error as Error).message;
        }
      },
    });
    if (!input) return;
    const language = await vscode.window.showQuickPick(
      [
        { label: 'C++', value: 'cpp' as const },
        { label: 'Python 3', value: 'python' as const },
      ],
      { title: 'Default solution language for this contest' },
    );
    if (!language) return;
    await this.task('Looking up contest…', async () => {
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
      this.registrationMessage = undefined;
      this.announcementsMessage = undefined;
      this.errorMessage = undefined;
      this.lastBoard = 0;
    }
    this.selectedId = id;
    await this.context.workspaceState.update('cfide.selectedContest', id);
    await this.publish();
  }
  private async openCenter(id?: number) {
    if (id) await this.select(id);
    if (!this.dashboard) {
      this.dashboard = vscode.window.createWebviewPanel(
        'cfide.contestCenter',
        'CFIDE · Contest Center',
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
    if (message.type === 'addContest') return this.add();
    if (message.type === 'login') return this.login();
    if (message.type === 'logout') {
      this.trust();
      await this.session.logout();
      return this.publish();
    }
    if (message.type === 'connectCookie') return this.connectCookie();
    if (message.type === 'watchHandle') {
      const handle = await vscode.window.showInputBox({
        title: 'Codeforces handle (read-only tracking)',
        value: this.handle(),
        validateInput: (h) => (/^[A-Za-z0-9_.-]{1,64}$/.test(h) ? null : 'Enter a valid handle.'),
      });
      if (handle)
        await vscode.workspace
          .getConfiguration('cfide')
          .update('codeforces.handle', handle, vscode.ConfigurationTarget.Global);
      return this.publish();
    }
    if (message.type === 'checkEnvironment')
      return this.task('Checking local environment…', () =>
        this.workspace.checkEnvironment(message.language),
      );
    if (message.type === 'rankFilter') {
      this.rankMode = message.mode;
      this.rankSearch = message.search;
      return this.publish();
    }
    if (message.type === 'selectContest') return this.select(message.contestId);
    this.trust();
    const { repo, service } = this.runtime();
    await repo.get(message.contestId);
    if (message.type === 'openProblem') return this.openProblem(message.contestId, message.index);
    if (message.type === 'syncContest')
      return this.task('Downloading available problems…', () =>
        service.sync(message.contestId, message.index),
      );
    if (message.type === 'refreshStatus')
      return this.task('Refreshing submissions…', () => this.refreshStatus(message.contestId));
    if (message.type === 'refreshStandings')
      return this.task('Refreshing official rankings…', () =>
        service.refreshBoard(message.contestId),
      );
    if (message.type === 'archive') {
      await repo.update(message.contestId, (r) => {
        r.archived = message.archived;
      });
      return this.changed(message.contestId);
    }
    if (message.type === 'autoDownload') {
      await repo.update(message.contestId, (r) => {
        r.autoDownload = message.enabled;
      });
      return this.changed(message.contestId);
    }
    if (message.type === 'defaultLanguage') {
      await repo.update(message.contestId, (r) => {
        r.defaultLanguage = message.language;
      });
      return this.changed(message.contestId);
    }
    if (message.type === 'resolveAttempt')
      return this.resolveAttempt(message.contestId, message.attemptId);
    if (message.type === 'viewSnapshot') {
      const attempt = (await repo.attempts(message.contestId)).find(
        (a) => a.id === message.attemptId,
      );
      if (attempt) {
        const uri = vscode.Uri.from({
          scheme: 'cfide-snapshot',
          path: `/${attempt.id}/main.${attempt.language === 'cpp' ? 'cpp' : 'py'}`,
        });
        this.snapshots.set(uri.toString(), await fs.readFile(repo.snapshotPath(attempt), 'utf8'));
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
      }
      return;
    }
    if (message.type === 'registration')
      return this.task('Checking official registration…', async () => {
        if (
          message.register &&
          (await vscode.window.showWarningMessage(
            'Send a registration request for contest ' +
              message.contestId +
              ' as ' +
              this.session.handle +
              '? Adding a contest locally does not register you.',
            { modal: true },
            'Register',
          )) !== 'Register'
        )
          return;
        this.registrationMessage = await this.session.registration(
          message.contestId,
          message.register,
        );
      });
    if (message.type === 'announcements')
      return this.task('Reading contest messages…', async () => {
        const page = await this.session.page(`/contest/${message.contestId}`),
          $ = cheerio.load(page.html);
        this.announcementsMessage =
          $('.contest-announcement, .announcement, .notice')
            .text()
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 8000) ||
          'No announcement text was recognized in the returned page. This is not a guarantee that the contest has no announcements.';
      });
  }
  private async openProblem(id: number, index: string) {
    const { repo, service } = this.runtime();
    const record = await repo.get(id);
    const item = record.problems.find((p) => p.index === index);
    if (!item?.ready) {
      await this.task('Downloading problem…', () => service.sync(id, index));
    }
    const problem = (await repo.problems(id).listProblems()).find((p) => p.id === index);
    if (!problem || !(await repo.statement(id, index)))
      throw new Error('Problem is not ready. Check its download error and retry.');
    await this.workspace.openInStore(repo.problems(id), problem);
  }
  private async openStatement(id: number, index: string) {
    const statement = await this.runtime().repo.statement(id, index);
    if (!statement) return;
    this.statementTarget = { contestId: id, index };
    if (!this.statementPanel) {
      this.statementPanel = vscode.window.createWebviewPanel(
        'cfide.statement',
        'CFIDE · Statement',
        { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
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
          if (raw?.type === 'ready' && this.statementTarget) {
            const target = this.statementTarget,
              data = await this.runtime().repo.statement(target.contestId, target.index);
            if (data && this.statementTarget === target && this.statementPanel)
              void this.statementPanel.webview.postMessage({
                type: 'statement',
                ...target,
                statement: this.mapAssets(target.contestId, data),
              } satisfies ContestHostMessage);
          }
        },
        null,
        this.disposables,
      );
    } else this.statementPanel.reveal(vscode.ViewColumn.Two, true);
    this.statementPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        vscode.Uri.file(this.runtime().repo.assets(id)),
      ],
    };
    this.statementPanel.title = `${id} · ${index} · Statement`;
    void this.statementPanel.webview.postMessage({
      type: 'statement',
      contestId: id,
      index,
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
    });
    return { ...statement, html: $.html() };
  }
  private async login() {
    this.trust();
    const handle = await vscode.window.showInputBox({
      title: 'Codeforces sign in',
      prompt: 'Handle or email. Your password is sent only to codeforces.com and is not stored.',
    });
    if (!handle) return;
    const password = await vscode.window.showInputBox({
      title: 'Codeforces password',
      password: true,
      ignoreFocusOut: true,
    });
    if (!password) return;
    await this.task('Signing in to Codeforces…', async () => {
      await this.session.login(handle, password);
    });
  }
  private async connectCookie() {
    this.trust();
    const cookie = await vscode.window.showInputBox({
      title: 'Connect an existing Codeforces session (advanced)',
      prompt:
        'Paste the Cookie header from your own authenticated Codeforces session. Stored only in VS Code SecretStorage; never in the workspace.',
      password: true,
      ignoreFocusOut: true,
    });
    if (cookie)
      await this.task('Validating session…', async () => {
        await this.session.connectCookie(cookie);
      });
  }
  private async submit() {
    this.trust();
    await this.initialized;
    if (this.submitting) throw new Error('A submission is already being prepared.');
    this.submitting = true;
    try {
      const snapshot = await this.workspace.snapshot(),
        { problem, source } = snapshot;
      if (!problem.contestId)
        throw new Error('Select a Codeforces contest problem, not a local practice problem.');
      if (!this.session.handle) {
        await this.login();
        if (!this.session.handle) return;
      }
      const { repo, service } = this.runtime();
      const id = problem.contestId;
      if (repo.contestRoot(id) !== snapshot.store.root)
        throw new Error('Workspace changed before submission. No source was sent.');
      const form = await this.session.submitForm(id);
      const choices = form.languages.filter((p) =>
        problem.language === 'cpp' ? /C\+\+|G\+\+/i.test(p.name) : /Python|PyPy/i.test(p.name),
      );
      if (!choices.length)
        throw new Error('No matching language is offered by Codeforces for this contest.');
      const key = `cfide.programType.${id}.${problem.language}`;
      const remembered = this.context.workspaceState.get<string>(key);
      let type;
      {
        const selected = await vscode.window.showQuickPick(
          [...choices]
            .sort((a, b) => Number(b.id === remembered) - Number(a.id === remembered))
            .map((p) => ({
              label: p.name,
              id: p.id,
              description: p.id === remembered ? 'Last used' : undefined,
            })),
          {
            title: `Submit ${id}/${problem.id} as ${this.session.handle}: choose exact Codeforces language`,
          },
        );
        if (!selected) return;
        type = { id: selected.id, name: selected.label };
        await this.context.workspaceState.update(key, type.id);
      }
      await this.task(`Submitting ${id}/${problem.id} · ${type.name}…`, async () => {
        const attempt = await service.submit(
          id,
          problem.id,
          problem.language,
          type!.id,
          type!.name,
          source,
          form.fields,
        );
        this.pendingContests.add(id);
        await this.select(id);
        if (attempt.state === 'confirmed')
          void vscode.window.showInformationMessage(
            `CFIDE: submission #${attempt.submissionId} received. Tracking verdict.`,
          );
        else
          void vscode.window.showWarningMessage(
            `CFIDE: ${attempt.state === 'rejected' ? 'Submission rejected' : 'Submission receipt uncertain'}. Open Contest Center → My submissions for details.`,
          );
        await service.refreshSubmissions(id, this.session.handle!);
      });
    } finally {
      this.submitting = false;
    }
  }
  private async resolveAttempt(id: number, attemptId: string) {
    const { repo } = this.runtime();
    const attempt = (await repo.attempts(id)).find((a) => a.id === attemptId);
    if (!attempt || !['prepared', 'sending', 'uncertain'].includes(attempt.state)) return;
    const choice = await vscode.window.showQuickPick(
      ['Verify and link an official submission', 'I checked: no submission was received'],
      { title: 'Resolve uncertain receipt. Do not resubmit without checking.' },
    );
    if (!choice) return;
    if (choice.startsWith('I checked')) {
      if (
        (await vscode.window.showWarningMessage(
          'This unlocks a new submission and may cause a duplicate if Codeforces received the earlier request. Have you checked your official submissions?',
          { modal: true },
          'Mark resolved',
        )) !== 'Mark resolved'
      )
        return;
      attempt.state = 'rejected';
      attempt.message = 'Manually resolved by user: no receipt found; new submission unlocked.';
    } else {
      const official = await this.api.submissions(id, attempt.handle);
      const selected = await vscode.window.showQuickPick(
        official
          .filter(
            (s) =>
              s.problem.index === attempt.problemIndex &&
              s.programmingLanguage === attempt.programTypeName &&
              s.id > (attempt.baselineId ?? 0),
          )
          .map((s) => ({ label: `#${s.id} · ${submissionLabel(s)}`, id: s.id })),
        { title: 'Choose the submission whose source should match the saved snapshot' },
      );
      if (!selected) return;
      const page = await this.session.page(`/contest/${id}/submission/${selected.id}`),
        $ = cheerio.load(page.html);
      const remote = $('#program-source-text').text(),
        local = await fs.readFile(repo.snapshotPath(attempt), 'utf8');
      if (
        !remote ||
        createHash('sha256').update(local).digest('hex') !== attempt.sourceHash ||
        remote.replace(/\r\n/g, '\n').trimEnd() !== local.replace(/\r\n/g, '\n').trimEnd()
      )
        throw new Error(
          'Official source is unavailable or differs from the saved snapshot. No link was made.',
        );
      attempt.state = 'confirmed';
      attempt.submissionId = selected.id;
      attempt.message = 'Source snapshot verified against official submission.';
    }
    await repo.saveAttempt(attempt);
    await this.publish();
  }
  private async refreshStatus(id: number) {
    const handle = this.handle();
    if (!handle) throw new Error('Sign in or set a read-only handle.');
    await this.runtime().service.refreshSubmissions(id, handle);
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
        if (
          handle &&
          Date.now() - (this.lastStatus.get(id) ?? 0) >= Math.max(5000, ids.size * 3000)
        ) {
          this.lastStatus.set(id, Date.now());
          try {
            await service.refreshSubmissions(id, handle);
          } catch (error) {
            this.lastStatus.set(id, Date.now() + 10000);
            throw error;
          }
          const cached = await repo.submissions(id, handle);
          if (
            !cached.submissions.some(
              (s) => !s.verdict || ['TESTING', 'SUBMITTED'].includes(s.verdict),
            )
          )
            this.pendingContests.delete(id);
        }
      }
      if (this.selectedId && this.dashboard?.visible && Date.now() - this.lastBoard > 30000) {
        this.lastBoard = Date.now();
        const record = await repo.get(this.selectedId);
        if (!record.archived && record.contest.phase !== 'BEFORE')
          await service.refreshBoard(this.selectedId);
      }
    } finally {
      this.pollBusy = false;
    }
  }
  private async publish() {
    if (!this.dashboard) return;
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
        selectedId: selected,
        signedInHandle: this.session.handle,
        watchHandle: handle,
        submissions: status.submissions,
        submissionsUpdatedAt: status.fetchedAt,
        attempts: selected ? await repo.attempts(selected) : [],
        rows: rows.slice(0, 100),
        rankProblemIndices: board?.problems.map((p) => p.index) ?? [],
        rankTotal: board?.rows.length ?? 0,
        rankingsUpdatedAt: board?.fetchedAt ?? 0,
        rankMode: this.rankMode,
        busy: this.busy,
        error: this.errorMessage,
        registration: this.registrationMessage,
        announcements: this.announcementsMessage,
        serverNow: Date.now() + this.api.clockOffset,
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
    if (notify) void vscode.window.showErrorMessage('CFIDE: ' + this.errorMessage);
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
      const now = Math.floor((Date.now() + this.api.clockOffset) / 1000),
        start = c.startTimeSeconds;
      const remaining = start
        ? now < start
          ? start - now
          : Math.max(0, start + c.durationSeconds - now)
        : 0;
      const time = `${Math.floor(remaining / 3600)}:${String(Math.floor(remaining / 60) % 60).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
      this.status.text = `$(trophy) CF ${c.id} · ${start && now < start ? 'Starts in ' : 'Remaining '}${time}`;
      this.status.tooltip = c.name + '\n' + c.phase;
      this.status.show();
    } catch {
      this.status.hide();
    }
  }
  dispose() {
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
