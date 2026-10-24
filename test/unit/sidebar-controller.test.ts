import { expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
vi.mock('vscode', () => ({
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
  },
  TreeItemCollapsibleState: { Expanded: 2 },
  TreeItem: class {
    constructor(
      public label: string,
      public collapsibleState: number,
    ) {}
  },
  ThemeIcon: class {
    constructor(public id: string) {}
  },
  env: { language: 'en' },
  workspace: { getConfiguration: () => ({ get: (_: string, fallback: unknown) => fallback }) },
}));
import { SidebarController } from '../../src/vscode/sidebar-controller';
import { parseProblemReference } from '../../src/domain/contest';
it('has exactly three ordered groups, one import action each, and only global settings in the header', async () => {
  const sidebar = new SidebarController({} as any, {} as any);
  const groups = await sidebar.getChildren();
  expect(groups.map((node) => sidebar.getTreeItem(node).label)).toEqual([
    'Codeforces Contests',
    'Codeforces Problems',
    'Local Practice',
  ]);
  const manifest = JSON.parse(await fs.readFile('package.json', 'utf8'));
  expect(manifest.contributes.views.cfide).toHaveLength(1);
  expect(manifest.contributes.menus['view/title'].map((i: any) => i.command)).toEqual([
    'cfide.openSettings',
  ]);
  expect(manifest.contributes.menus['view/item/context'].map((i: any) => i.command)).toEqual([
    'cfide.addContest',
    'cfide.addCodeforcesProblem',
    'cfide.createProblem',
  ]);
  expect(manifest.contributes.viewsWelcome).toBeUndefined();
});
it('accepts public single-problem URLs and short IDs, rejecting unrelated hosts and paths', () => {
  for (const input of [
    '4A',
    '4 a',
    'https://codeforces.com/contest/4/problem/A',
    'https://codeforces.com/problemset/problem/4/A',
  ])
    expect(parseProblemReference(input)).toEqual({ contestId: 4, index: 'A' });
  for (const input of [
    'https://evil.test/contest/4/problem/A',
    'http://codeforces.com/contest/4/problem/A',
    'https://codeforces.com/gym/100001/problem/A',
    '4',
    '../4A',
  ])
    expect(() => parseProblemReference(input)).toThrow();
});
