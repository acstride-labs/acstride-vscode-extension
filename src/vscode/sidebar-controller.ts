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
  | { kind: 'contest'; record: ContestRecord }
  | { kind: 'problem'; group: 'standalone' | 'local'; problem: Problem };
/** Three native peer views expose VS Code visibility toggles without redundant group nodes. */
export class SidebarController implements vscode.TreeDataProvider<SidebarNode>, vscode.Disposable {
  private changes = new vscode.EventEmitter<SidebarNode | undefined>();
  readonly onDidChangeTreeData = this.changes.event;
  private disposables: vscode.Disposable[] = [];
  private views = new Map<Group, vscode.TreeView<SidebarNode>>();
  constructor(
    private workspace: WorkspaceController,
    private contests: ContestController,
  ) {}
  register() {
    for (const [id, group] of [
      ['codeforcesWorkbench.contests', 'contest'],
      ['codeforcesWorkbench.codeforcesProblems', 'standalone'],
      ['codeforcesWorkbench.problems', 'local'],
    ] as const) {
      const provider: vscode.TreeDataProvider<SidebarNode> = {
        onDidChangeTreeData: this.onDidChangeTreeData,
        getChildren: (node) => this.getChildren(node, group),
        getTreeItem: (node) => this.getTreeItem(node),
      };
      const view = vscode.window.createTreeView(id, { treeDataProvider: provider });
      this.views.set(group, view);
      this.disposables.push(view);
    }
    const refresh = () => {
      for (const [group, view] of this.views)
        view.title = t(
          {
            contest: 'Codeforces Contests',
            standalone: 'Codeforces Problems',
            local: 'Local Practice',
          }[group],
        );
      this.changes.fire(undefined);
    };
    refresh();
    this.disposables.push(
      this.changes,
      this.workspace.onDidChangeTreeData(refresh),
      this.contests.onDidChangeTreeData(refresh),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('codeforcesWorkbench.ui.language')) refresh();
      }),
    );
  }
  async getChildren(node?: SidebarNode, group: Group = 'contest'): Promise<SidebarNode[]> {
    if (node) return [];
    try {
      if (group === 'contest') return this.contests.getChildren();
      const problems =
        group === 'standalone'
          ? await this.contests.standaloneProblems()
          : await this.workspace.localStore().listProblems();
      return newestImportedFirst(problems).map((problem) => ({ kind: 'problem', group, problem }));
    } catch {
      return [];
    } // Empty views retain their native header import actions.
  }
  getTreeItem(node: SidebarNode): vscode.TreeItem {
    if (node.kind === 'contest') return this.contests.getTreeItem(node);
    if (node.group === 'local') {
      const item = new vscode.TreeItem(`${node.problem.id} · ${node.problem.title}`);
      item.id = `local:${node.problem.id}`;
      item.description = languages[node.problem.language].label;
      item.iconPath = new vscode.ThemeIcon('code');
      item.command = { command: 'codeforcesWorkbench.openProblem', title: t('Open'), arguments: [node.problem] };
      return item;
    }
    const problem = node.problem;
    const item = new vscode.TreeItem(`${problem.contestId}${problem.id} · ${problem.title}`);
    item.id = `single:${problem.contestId}/${problem.id}`;
    item.iconPath = new vscode.ThemeIcon('code');
    item.tooltip = item.label as string;
    item.command = {
      command: 'codeforcesWorkbench.openCodeforcesProblem',
      title: t('Open'),
      arguments: [problem],
    };
    return item;
  }
  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
