import * as vscode from 'vscode';
import type { ContestRecord } from '../domain/contest';
import { newestImportedFirst } from '../domain/contest';
import { languages } from '../domain/languages';
import type { Problem } from '../domain/models';
import type { ContestController } from './contest-controller';
import type { WorkspaceController } from './workspace-controller';
import { t } from './localization';
type Group = 'contest' | 'standalone' | 'local';
type SidebarNode =
  | { kind: 'group'; group: Group }
  | { kind: 'contest'; record: ContestRecord }
  | { kind: 'problem'; group: 'standalone' | 'local'; problem: Problem };
/** One native view lets VS Code place the global gear in the container header. */
export class SidebarController implements vscode.TreeDataProvider<SidebarNode>, vscode.Disposable {
  private changes = new vscode.EventEmitter<SidebarNode | undefined>();
  readonly onDidChangeTreeData = this.changes.event;
  private disposables: vscode.Disposable[] = [];
  constructor(
    private workspace: WorkspaceController,
    private contests: ContestController,
  ) {}
  register() {
    const view = vscode.window.createTreeView('cfide.contests', { treeDataProvider: this });
    view.title = 'AC-Stride';
    const refresh = () => this.changes.fire(undefined);
    this.disposables.push(
      view,
      this.changes,
      this.workspace.onDidChangeTreeData(refresh),
      this.contests.onDidChangeTreeData(refresh),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('cfide.ui.language')) refresh();
      }),
    );
  }
  async getChildren(node?: SidebarNode): Promise<SidebarNode[]> {
    if (!node)
      return ['contest', 'standalone', 'local'].map((group) => ({
        kind: 'group',
        group: group as Group,
      }));
    if (node.kind !== 'group') return [];
    try {
      if (node.group === 'contest') return this.contests.getChildren();
      const group = node.group;
      const problems =
        group === 'standalone'
          ? await this.contests.standaloneProblems()
          : await this.workspace.localStore().listProblems();
      return newestImportedFirst(problems).map((problem) => ({ kind: 'problem', group, problem }));
    } catch {
      return [];
    } // Empty/no-folder workspaces still show the three import controls.
  }
  getTreeItem(node: SidebarNode): vscode.TreeItem {
    if (node.kind === 'group') {
      const title = {
        contest: 'Codeforces Contests',
        standalone: 'Codeforces Problems',
        local: 'Local Practice',
      }[node.group];
      const item = new vscode.TreeItem(t(title), vscode.TreeItemCollapsibleState.Expanded);
      item.id = `group:${node.group}`;
      item.contextValue = `cfide.${node.group}Group`;
      return item;
    }
    if (node.kind === 'contest') return this.contests.getTreeItem(node);
    if (node.group === 'local') {
      const item = new vscode.TreeItem(`${node.problem.id} · ${node.problem.title}`);
      item.id = `local:${node.problem.id}`;
      item.description = languages[node.problem.language].label;
      item.iconPath = new vscode.ThemeIcon('code');
      item.command = { command: 'cfide.openProblem', title: t('Open'), arguments: [node.problem] };
      return item;
    }
    const problem = node.problem;
    const item = new vscode.TreeItem(`${problem.contestId}${problem.id} · ${problem.title}`);
    item.id = `single:${problem.contestId}/${problem.id}`;
    item.iconPath = new vscode.ThemeIcon('code');
    item.tooltip = item.label as string;
    item.command = {
      command: 'cfide.openCodeforcesProblem',
      title: t('Open'),
      arguments: [problem],
    };
    return item;
  }
  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
