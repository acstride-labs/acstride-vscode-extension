import * as vscode from 'vscode';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Language, Problem } from '../domain/models';
import { languages } from '../domain/languages';
import { FileWorkspaceStore } from '../infrastructure/storage/file-workspace-store';
import { CppRunner } from '../infrastructure/execution/cpp-runner';
import { PythonRunner } from '../infrastructure/execution/python-runner';
import { RunTests } from '../application/run-tests';
import { requestSchema, type HostMessage } from '../shared/protocol';
import { webviewHtml } from './webview-html';

export class WorkspaceController implements vscode.Disposable, vscode.TreeDataProvider<Problem> {
  private changes = new vscode.EventEmitter<Problem | undefined>();
  readonly onDidChangeTreeData = this.changes.event;
  private view?: vscode.WebviewView;
  private current?: Problem;
  private scopedStore?: FileWorkspaceStore;
  private abort?: AbortController;
  private busy = false;
  private dirtyTests = false;
  private mutation: Promise<unknown> = Promise.resolve();
  private disposables: vscode.Disposable[] = [];
  private readonly output = vscode.window.createOutputChannel('CFIDE');
  resolveSource?: (
    source: string,
  ) => Promise<{ store: FileWorkspaceStore; problem: Problem } | undefined>;
  onProblemOpened?: (store: FileWorkspaceStore, problem: Problem) => Promise<void>;
  constructor(private context: vscode.ExtensionContext) {}
  localStore() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) throw new Error('Open a folder in VS Code first.');
    if (folders.length !== 1 || folders[0].uri.scheme !== 'file')
      throw new Error('A single file-based workspace folder is required.');
    return new FileWorkspaceStore(folders[0].uri.fsPath);
  }
  private store() {
    return this.scopedStore ?? this.localStore();
  }
  active() {
    return this.current ? { store: this.store(), problem: this.current } : undefined;
  }
  private trust() {
    if (!vscode.workspace.isTrusted)
      throw new Error(
        'Trust this workspace before creating files, compiling, running or submitting code.',
      );
  }
  register() {
    this.disposables.push(
      this.changes,
      this.output,
      vscode.window.registerTreeDataProvider('cfide.problems', this),
      vscode.window.registerWebviewViewProvider(
        'cfide.tests',
        { resolveWebviewView: (view) => this.initializeView(view) },
        { webviewOptions: { retainContextWhenHidden: true } },
      ),
    );
    const command = (name: string, fn: (...args: any[]) => unknown) =>
      this.disposables.push(
        vscode.commands.registerCommand(name, async (...args) => {
          try {
            await fn(...args);
          } catch (error) {
            this.error(error);
          }
        }),
      );
    command('cfide.createProblem', () => this.create());
    command('cfide.openProblem', (p: Problem) => this.openInStore(this.localStore(), p));
    command('cfide.refresh', () => this.changes.fire(undefined));
    command('cfide.switchLanguage', () => this.switchLanguage());
    command('cfide.runTests', async () => {
      await this.mutation;
      const file = vscode.window.activeTextEditor?.document.uri.fsPath;
      if (file) {
        let resolved = await this.resolveSource?.(file);
        if (!resolved) {
          const store = this.localStore();
          for (const p of await store.listProblems())
            for (const language of ['cpp', 'python'] as const)
              if (store.sourcePath(p.id, language) === file)
                resolved = { store, problem: { ...p, language } };
        }
        if (!resolved) throw new Error('Open a CFIDE solution file first.');
        if (
          this.current?.id !== resolved.problem.id ||
          this.current?.contestId !== resolved.problem.contestId ||
          this.current?.language !== resolved.problem.language
        )
          await this.openInStore(resolved.store, resolved.problem);
      }
      await this.run();
    });
    command('cfide.stop', () => this.abort?.abort());
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.abort?.abort();
        this.current = undefined;
        this.scopedStore = undefined;
        this.dirtyTests = false;
        this.changes.fire(undefined);
      }),
    );
  }
  async getChildren() {
    try {
      return await this.localStore().listProblems();
    } catch (error) {
      this.output.appendLine(String(error));
      return [];
    }
  }
  getTreeItem(p: Problem) {
    const item = new vscode.TreeItem(p.id + ' · ' + p.title);
    item.description = languages[p.language].label;
    item.iconPath = new vscode.ThemeIcon('code');
    item.command = { command: 'cfide.openProblem', title: 'Open', arguments: [p] };
    return item;
  }
  async template(language: Language, id: string) {
    const configured = vscode.workspace
      .getConfiguration('cfide')
      .get<string>(language + '.templatePath', '');
    return (
      await fs.readFile(
        configured ||
          path.join(
            this.context.extensionPath,
            'resources',
            'templates',
            languages[language].template,
          ),
        'utf8',
      )
    ).replaceAll('$' + '{PROBLEM_ID}', id);
  }
  async checkEnvironment(language: Language) {
    this.trust();
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-env-'));
    try {
      const file = path.join(folder, languages[language].sourceFile);
      await fs.writeFile(
        file,
        language === 'cpp' ? '#include <iostream>\nint main(){std::cout << 5;}' : 'print(5)\n',
      );
      const config = vscode.workspace.getConfiguration('cfide');
      const result = await (language === 'cpp' ? new CppRunner() : new PythonRunner()).run(
        file,
        [{ id: 'check', input: '', expected: '5' }],
        {
          command: config.get<string>(
            language === 'cpp' ? 'cpp.compiler' : 'python.interpreter',
            language === 'cpp' ? 'g++' : 'python3',
          ),
          args: config.get<string[]>(language + '.args', []),
          timeoutMs: 3000,
        },
        new AbortController().signal,
      );
      if (result.compileError || result.results[0]?.verdict !== 'AC')
        throw new Error(
          result.compileError || result.results[0]?.stderr || 'Environment check failed.',
        );
      void vscode.window.showInformationMessage(
        `${languages[language].label} environment is ready.`,
      );
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  }
  private async create() {
    this.trust();
    this.ensureIdle();
    await this.mutation;
    const store = this.localStore();
    const selected = await vscode.window.showQuickPick(
      (Object.entries(languages) as [Language, (typeof languages)[Language]][]).map(
        ([language, value]) => ({ label: value.label, description: value.sourceFile, language }),
      ),
      { title: 'Problem language' },
    );
    if (!selected) return;
    const id = await vscode.window.showInputBox({
      title: 'Create local problem',
      value: 'A',
      validateInput: (s) =>
        /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(s)
          ? null
          : 'Use 1–64 letters, digits, underscores or hyphens.',
    });
    if (!id) return;
    const title = await vscode.window.showInputBox({
      title: 'Problem title',
      value: 'Sum of two numbers',
      validateInput: (s) =>
        s.trim() && s.length <= 200 ? null : 'Enter a title up to 200 characters.',
    });
    if (!title) return;
    const problem = await store.createProblem(
      id,
      title,
      await this.template(selected.language, id),
      selected.language,
    );
    await store.saveTest(id, { id: 'sample-1', input: '2 3\n', expected: '5\n' });
    this.changes.fire(undefined);
    await this.openInStore(store, problem);
  }
  private ensureIdle() {
    if (this.busy) throw new Error('Stop the current test run before switching problems.');
    if (this.dirtyTests) throw new Error('Save test changes before switching problems.');
  }
  async openInStore(store: FileWorkspaceStore, problem: Problem) {
    this.ensureIdle();
    await this.mutation;
    this.ensureIdle();
    const saved = (await store.listProblems()).find((p) => p.id === problem.id);
    if (!saved) throw new Error('Problem is not downloaded yet.');
    if (saved.language !== problem.language) {
      this.trust();
      await store.selectLanguage(
        saved.id,
        problem.language,
        await this.template(problem.language, saved.id),
      );
      saved.language = problem.language;
    }
    this.scopedStore = store;
    this.current = saved;
    await vscode.window.showTextDocument(
      vscode.Uri.file(store.sourcePath(saved.id, saved.language)),
      { viewColumn: vscode.ViewColumn.One },
    );
    await this.onProblemOpened?.(store, saved);
    await vscode.commands.executeCommand('cfide.tests.focus');
    await this.context.workspaceState.update('cfide.lastProblem', {
      root: store.root,
      id: saved.id,
      contestId: saved.contestId,
    });
    await this.state();
  }
  async restoreLast() {
    const last = this.context.workspaceState.get<{ root: string; id: string; contestId?: number }>(
      'cfide.lastProblem',
    );
    if (!last || typeof last !== 'object' || !vscode.workspace.isTrusted) return;
    const root = this.localStore().root;
    const expected = last.contestId ? path.join(root, 'contests', String(last.contestId)) : root;
    if (expected !== last.root) return;
    const store = new FileWorkspaceStore(expected, last.contestId);
    const problem = (await store.listProblems()).find((p) => p.id === last.id);
    if (problem) await this.openInStore(store, problem);
  }
  private async switchLanguage() {
    this.trust();
    this.ensureIdle();
    await this.mutation;
    if (!this.current) throw new Error('Open a problem first.');
    const selected = await vscode.window.showQuickPick(
      (Object.entries(languages) as [Language, (typeof languages)[Language]][]).map(
        ([language, value]) => ({ label: value.label, language }),
      ),
      { title: 'Solution language (existing source is preserved)' },
    );
    if (!selected) return;
    const store = this.store();
    const problem = await store.selectLanguage(
      this.current.id,
      selected.language,
      await this.template(selected.language, this.current.id),
    );
    await this.openInStore(store, problem);
    this.changes.fire(undefined);
  }
  private initializeView(view: vscode.WebviewView) {
    this.view = view;
    const assets = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    view.webview.options = { enableScripts: true, localResourceRoots: [assets] };
    view.webview.html = webviewHtml(view.webview, this.context.extensionUri, 'tests');
    view.onDidDispose(
      () => {
        this.abort?.abort();
        this.dirtyTests = false;
        if (this.view === view) this.view = undefined;
      },
      null,
      this.disposables,
    );
    view.webview.onDidReceiveMessage(
      (raw) => {
        const parsed = requestSchema.safeParse(raw);
        if (!parsed.success) {
          this.error(new Error('Invalid tests request.'));
          return;
        }
        const message = parsed.data;
        if (message.type === 'stop') {
          this.abort?.abort();
          return;
        }
        if (message.type === 'draftState') {
          this.dirtyTests = message.dirty;
          return;
        }
        if (message.type === 'switchLanguage') {
          void this.switchLanguage().catch((e) => this.error(e));
          return;
        }
        if (message.type === 'submit') {
          void vscode.commands.executeCommand('cfide.submitSolution');
          return;
        }
        const captured = this.current;
        this.mutation = this.mutation
          .then(async () => {
            if (message.type === 'ready') {
              await this.state();
              return;
            }
            if (!this.current || captured !== this.current)
              throw new Error('Problem changed; retry the operation.');
            this.trust();
            if (message.type === 'saveTest') {
              await this.store().saveTest(this.current.id, message.test);
              await this.state();
            } else if (message.type === 'deleteTest') {
              await this.store().deleteTest(this.current.id, message.testId);
              await this.state();
            } else if (message.type === 'run') await this.run(message.testId);
          })
          .catch((error) => this.error(error));
      },
      null,
      this.disposables,
    );
  }
  private async state() {
    if (this.current)
      this.send({
        type: 'state',
        problem: this.current,
        tests: await this.store().listTests(this.current.id),
      });
  }
  private send(message: HostMessage) {
    void this.view?.webview.postMessage(message);
  }
  private error(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.output.appendLine(message);
    this.send({ type: 'error', message });
    void vscode.window.showErrorMessage('CFIDE: ' + message);
  }
  async snapshot() {
    this.trust();
    if (!this.current) throw new Error('Open a problem first.');
    const active = { store: this.store(), problem: { ...this.current } };
    const uri = vscode.Uri.file(
      active.store.sourcePath(active.problem.id, active.problem.language),
    );
    const document = await vscode.workspace.openTextDocument(uri);
    if (document.isDirty && !(await document.save())) throw new Error('Could not save source.');
    return { ...active, source: await fs.readFile(uri.fsPath, 'utf8') };
  }
  private async run(testId?: string) {
    this.trust();
    if (this.busy) throw new Error('A test run is already in progress.');
    if (this.dirtyTests) throw new Error('Save test changes before running.');
    if (!this.current) throw new Error('Select a problem first.');
    this.busy = true;
    this.abort = new AbortController();
    this.send({ type: 'running', running: true });
    try {
      const { store, problem } = await this.snapshot();
      const config = vscode.workspace.getConfiguration('cfide'),
        python = problem.language === 'python';
      const command = python
        ? config.get<string>('python.interpreter', 'python3')
        : config.get<string>('cpp.compiler', 'g++');
      this.output.appendLine(
        'Running ' + store.sourcePath(problem.id, problem.language) + ' with ' + command,
      );
      const result = await new RunTests(
        store,
        python ? new PythonRunner() : new CppRunner(),
      ).execute(
        problem.id,
        {
          command,
          args: config.get<string[]>(python ? 'python.args' : 'cpp.args', []),
          timeoutMs: config.get<number>('run.timeoutMs', 2000),
        },
        this.abort.signal,
        (result) => this.send({ type: 'progress', result }),
        testId,
      );
      this.send({ type: 'result', result });
    } finally {
      this.busy = false;
      this.abort = undefined;
      this.send({ type: 'running', running: false });
    }
  }
  dispose() {
    this.abort?.abort();
    this.disposables.forEach((d) => d.dispose());
  }
}
