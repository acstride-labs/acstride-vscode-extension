import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Problem } from '../domain/models';
import { FileWorkspaceStore } from '../infrastructure/storage/file-workspace-store';
import { CppRunner } from '../infrastructure/execution/cpp-runner';
import { RunTests } from '../application/run-tests';
import { requestSchema, type HostMessage } from '../shared/protocol';
export class WorkspaceController implements vscode.Disposable, vscode.TreeDataProvider<Problem> {
  private changes = new vscode.EventEmitter<Problem | undefined>();
  readonly onDidChangeTreeData = this.changes.event;
  private panel?: vscode.WebviewPanel;
  private current?: Problem;
  private abort?: AbortController;
  private busy = false;
  private dirtyTests = false;
  private mutation: Promise<unknown> = Promise.resolve();
  private disposables: vscode.Disposable[] = [];
  private readonly output = vscode.window.createOutputChannel('CFIDE');
  constructor(private context: vscode.ExtensionContext) {}
  private store() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) throw new Error('Open a local folder in VS Code first.');
    if (folders.length !== 1) throw new Error('MVP supports a single workspace folder.');
    if (folders[0].uri.scheme !== 'file') throw new Error('A file-based workspace is required.');
    return new FileWorkspaceStore(folders[0].uri.fsPath);
  }
  private trust() {
    if (!vscode.workspace.isTrusted)
      throw new Error('Trust this workspace before creating files, compiling or running code.');
  }
  register() {
    this.disposables.push(
      this.changes,
      this.output,
      vscode.window.registerTreeDataProvider('cfide.problems', this),
    );
    const command = (name: string, fn: (...args: any[]) => unknown) =>
      this.disposables.push(
        vscode.commands.registerCommand(name, async (...args) => {
          try {
            await fn(...args);
          } catch (e) {
            this.error(e);
          }
        }),
      );
    command('cfide.createProblem', () => this.create());
    command('cfide.openProblem', (p: Problem) => this.open(p));
    command('cfide.refresh', () => this.changes.fire(undefined));
    command('cfide.runTests', async () => {
      await this.mutation;
      const file = vscode.window.activeTextEditor?.document.uri.fsPath;
      if (file || !this.current) {
        const problem = (await this.store().listProblems()).find(
          (p) => this.store().sourcePath(p.id) === file,
        );
        if (!problem) throw new Error('Open a CFIDE problem from the sidebar first.');
        if (problem.id !== this.current?.id || !this.panel) await this.open(problem);
      }
      await this.run();
    });
    command('cfide.stop', () => this.abort?.abort());
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.abort?.abort();
        this.current = undefined;
        this.panel?.dispose();
        this.changes.fire(undefined);
      }),
    );
  }
  async getChildren() {
    try {
      return await this.store().listProblems();
    } catch (e) {
      this.output.appendLine(String(e));
      return [];
    }
  }
  getTreeItem(p: Problem) {
    const item = new vscode.TreeItem(`${p.id} · ${p.title}`);
    item.iconPath = new vscode.ThemeIcon('code');
    item.command = { command: 'cfide.openProblem', title: 'Open', arguments: [p] };
    return item;
  }
  private async create() {
    this.trust();
    if (this.busy) throw new Error('Stop the current run before creating a problem.');
    await this.mutation;
    if (this.dirtyTests) throw new Error('Save test changes before creating a problem.');
    const store = this.store();
    const id = await vscode.window.showInputBox({
      title: 'Create local C++ problem',
      prompt: 'Problem ID (letters, digits, underscores and hyphens)',
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
    const config = vscode.workspace.getConfiguration('cfide');
    const templatePath = config.get<string>('cpp.templatePath', '');
    const template = await fs.readFile(
      templatePath ||
        path.join(this.context.extensionPath, 'resources', 'templates', 'default.cpp'),
      'utf8',
    );
    const problem = await store.createProblem(id, title, template.replaceAll('${PROBLEM_ID}', id));
    await store.saveTest(id, { id: 'sample-1', input: '2 3\n', expected: '5\n' });
    this.changes.fire(undefined);
    await this.open(problem);
  }
  private async open(problem: Problem) {
    if (this.busy) throw new Error('Stop the current run before switching problems.');
    await this.mutation;
    if (this.dirtyTests) throw new Error('Save test changes before switching problems.');
    const saved = (await this.store().listProblems()).find((p) => p.id === problem?.id);
    if (!saved) throw new Error('Unknown problem. Refresh the sidebar.');
    this.current = saved;
    await vscode.window.showTextDocument(vscode.Uri.file(this.store().sourcePath(saved.id)), {
      viewColumn: vscode.ViewColumn.One,
    });
    if (!this.panel) {
      const assets = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
      this.panel = vscode.window.createWebviewPanel(
        'cfide.tests',
        'CFIDE Tests',
        vscode.ViewColumn.Beside,
        { enableScripts: true, localResourceRoots: [assets], retainContextWhenHidden: true },
      );
      const webview = this.panel.webview,
        nonce = randomBytes(16).toString('hex');
      const uri = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(assets, file));
      webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${uri('app.css')}"></head><body><div id="root"></div><script nonce="${nonce}" type="module" src="${uri('app.js')}"></script></body></html>`;
      this.panel.onDidDispose(
        () => {
          this.abort?.abort();
          this.dirtyTests = false;
          this.panel = undefined;
        },
        null,
        this.disposables,
      );
      webview.onDidReceiveMessage(
        (raw) => {
          const parsed = requestSchema.safeParse(raw);
          if (!parsed.success) {
            this.error(new Error('Invalid webview request.'));
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
          // Serialize edits and runs so Run observes the preceding Save.
          this.mutation = this.mutation
            .then(async () => {
              if (message.type === 'ready') {
                await this.state();
                return;
              }
              if (!this.current) return;
              this.trust();
              if (message.type === 'saveTest') {
                await this.store().saveTest(this.current.id, message.test);
                await this.state();
              } else if (message.type === 'deleteTest') {
                await this.store().deleteTest(this.current.id, message.testId);
                await this.state();
              } else if (message.type === 'run') await this.run(message.testId);
            })
            .catch((e) => this.error(e));
        },
        null,
        this.disposables,
      );
    } else this.panel.reveal(vscode.ViewColumn.Beside, true);
    this.panel.title = `CFIDE · ${saved.id}`;
    await this.context.workspaceState.update('cfide.lastProblem', saved.id);
    await this.state();
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
    void this.panel?.webview.postMessage(message);
  }
  private error(e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    this.output.appendLine(message);
    this.send({ type: 'error', message });
    void vscode.window.showErrorMessage(`CFIDE: ${message}`);
  }
  private async run(testId?: string) {
    this.trust();
    if (this.busy) throw new Error('A run is already in progress.');
    if (this.dirtyTests) throw new Error('Save test changes before running.');
    if (!this.current) throw new Error('Select a problem first.');
    this.busy = true;
    this.abort = new AbortController();
    this.send({ type: 'running', running: true });
    try {
      const store = this.store(),
        source = store.sourcePath(this.current.id);
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(source));
      if (document.isDirty && !(await document.save()))
        throw new Error('Could not save source before running.');
      const config = vscode.workspace.getConfiguration('cfide');
      const compiler = config.get<string>('cpp.compiler', 'g++');
      this.output.appendLine(`Compiler: ${compiler}; source: ${source}`);
      const result = await new RunTests(store, new CppRunner()).execute(
        this.current.id,
        {
          compiler,
          args: config.get<string[]>('cpp.args', []),
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
    this.panel?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
