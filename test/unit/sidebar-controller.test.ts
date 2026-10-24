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
it('declares three toggleable native peer views with no redundant group or welcome view', async () => {
  const manifest = JSON.parse(await fs.readFile('package.json', 'utf8'));
  expect(manifest.contributes.views.cfide.map((view: any) => view.id)).toEqual([
    'cfide.contests',
    'cfide.codeforcesProblems',
    'cfide.problems',
  ]);
  expect(
    manifest.contributes.views.cfide.every((view: any) => view.canToggleVisibility === true),
  ).toBe(true);
  expect(manifest.contributes.views.cfide.map((view: any) => view.name)).toEqual([
    '%view.contests%',
    '%view.codeforcesProblems%',
    '%view.practice%',
  ]);
  const actions = manifest.contributes.menus['view/title'];
  expect(
    actions.filter((i: any) => i.group === 'navigation@1').map((i: any) => [i.command, i.when]),
  ).toEqual([
    ['cfide.addContest', 'view == cfide.contests'],
    ['cfide.addCodeforcesProblem', 'view == cfide.codeforcesProblems'],
    ['cfide.createProblem', 'view == cfide.problems'],
  ]);
  expect(manifest.contributes.menus['view/item/context']).toBeUndefined();
  expect(manifest.contributes.viewsWelcome).toBeUndefined();
});
it('loads each collection directly without adding group rows', async () => {
  const local = [
    { id: 'old', title: 'Old', language: 'cpp', importedAt: 1 },
    { id: 'new', title: 'New', language: 'python', importedAt: 2 },
  ];
  const contests = {
    getChildren: vi.fn(async () => [{ kind: 'contest', record: { contest: { id: 4 } } }]),
    standaloneProblems: vi.fn(async () => []),
  };
  const sidebar = new SidebarController(
    { localStore: () => ({ listProblems: async () => local }) } as any,
    contests as any,
  );
  expect(await sidebar.getChildren()).toEqual([
    { kind: 'contest', record: { contest: { id: 4 } } },
  ]);
  expect(await sidebar.getChildren(undefined, 'standalone')).toEqual([]);
  const nodes = await sidebar.getChildren(undefined, 'local');
  expect(nodes.map((node: any) => node.problem.id)).toEqual(['new', 'old']);
  expect(sidebar.getTreeItem(nodes[0]).label).toBe('new · New');
  expect(await sidebar.getChildren(nodes[0], 'local')).toEqual([]);
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
