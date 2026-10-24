import { expect, it, vi } from 'vitest';
vi.mock('vscode', () => ({
  env: { language: 'en' },
  workspace: {
    isTrusted: true,
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
  },
  TreeItemCollapsibleState: { None: 0 },
  TreeItem: class {
    constructor(
      public label: string,
      public collapsibleState: number,
    ) {}
  },
  ThemeIcon: class {
    constructor(public id: string) {}
  },
}));
import { ContestController } from '../../src/vscode/contest-controller';
import type { ContestRecord } from '../../src/domain/contest';
const record: ContestRecord = {
  schemaVersion: 1,
  contest: { id: 2261, name: 'Contest', phase: 'FINISHED', type: 'CF', durationSeconds: 7200 },
  archived: false,
  defaultLanguage: 'cpp',
  problems: [{ index: 'A', name: 'A', ready: true, downloadAttempts: 0, nextRetryAt: 0 }],
  updatedAt: 1,
  nextRetryAt: 0,
  retryCount: 0,
};
function fixture() {
  const service = {
    refreshSubmissions: vi.fn(async () => {}),
    refreshBoard: vi.fn(async () => {}),
  };
  const repo = {
    get: vi.fn(async () => record),
    list: vi.fn(async () => [record]),
    submissions: vi.fn(async () => ({ submissions: [] })),
  };
  const controller = Object.assign(Object.create(ContestController.prototype), {
    initialized: Promise.resolve(),
    selectedId: 2261,
    section: 'prepare',
    dashboard: { visible: true },
    workspace: { active: () => undefined },
    pendingContests: new Set(),
    lastStatus: new Map(),
    lastBoard: 0,
    backgroundErrors: new Map(),
    diagnostics: { appendLine: vi.fn() },
    runtime: () => ({ service, repo }),
    handle: () => 'tester',
    publish: vi.fn(async () => {}),
  });
  return { controller: controller as ContestController, service, repo };
}
it('renders contests as non-expandable clickable leaves with no problem children', async () => {
  const { controller } = fixture();
  const nodes = await controller.getChildren();
  expect(nodes).toHaveLength(1);
  expect(await controller.getChildren(nodes[0])).toEqual([]);
  const item = controller.getTreeItem(nodes[0]);
  expect(item.collapsibleState).toBe(0);
  expect(item.command?.command).toBe('cfide.openContestCenter');
  expect(item.command?.arguments).toEqual([nodes[0]]);
});
it('does not fetch full standings while the Problems tab is open', async () => {
  const { controller, service } = fixture();
  await (controller as any).poll();
  expect(service.refreshBoard).not.toHaveBeenCalled();
  expect(service.refreshSubmissions).toHaveBeenCalledOnce();
  await (controller as any).poll();
  expect(service.refreshSubmissions).toHaveBeenCalledOnce();
});
it('keeps background timeout notices scoped to their section and clears them after recovery', async () => {
  const { controller, service } = fixture();
  const host = controller as any;
  host.section = 'rankings';
  service.refreshBoard.mockRejectedValueOnce(new Error('timeout'));
  await host.poll();
  expect(host.errorMessage).toBeUndefined();
  expect(host.backgroundErrors.get('2261/rankings')).toContain('Cached data');
  expect(host.backgroundErrors.get('2261/prepare')).toBeUndefined();
  expect(host.diagnostics.appendLine).toHaveBeenCalledWith(
    expect.stringContaining('operation=rankings: timeout'),
  );
  host.lastBoard = 0;
  await host.poll();
  expect(host.backgroundErrors.has('2261/rankings')).toBe(false);
});

it('keeps refresh identity independent of translated labels and clears it after failure', async () => {
  const controller = Object.create(ContestController.prototype) as any;
  const snapshots: unknown[] = [];
  controller.publish = async () =>
    snapshots.push({ busy: controller.busy, refreshing: controller.refreshing });
  await controller.task('正在刷新官方排名…', async () => {}, 'rankings');
  expect(snapshots).toEqual([
    { busy: '正在刷新官方排名…', refreshing: 'rankings' },
    { busy: undefined, refreshing: undefined },
  ]);
  await expect(
    controller.task(
      '正在刷新提交记录…',
      async () => {
        throw new Error('timeout');
      },
      'submissions',
    ),
  ).rejects.toThrow('timeout');
  expect(controller.refreshing).toBeUndefined();
  expect(controller.busy).toBeUndefined();
});

it('delivers a completed translation with its problem identity after switching statements', async () => {
  const controller = Object.create(ContestController.prototype) as any;
  const target = {
    contestId: 2261,
    index: 'A',
    collection: 'contest',
    statement: { fetchedAt: 1, html: 'Original A' },
  };
  controller.statementTarget = target;
  controller.ai = { translationOptions: () => ({ enabled: true }) };
  let finish!: (html: string) => void;
  controller.translate = () =>
    new Promise<string>((resolve) => {
      finish = resolve;
    });
  controller.mapAssets = (_id: number, statement: unknown) => statement;
  const postMessage = vi.fn();
  controller.dashboard = { webview: { postMessage } };
  const translating = controller.showTranslation({ contestId: 2261, index: 'A' });
  controller.statementTarget = { ...target, index: 'B' };
  finish('Translated A');
  await translating;
  expect(postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: 'translation',
      contestId: 2261,
      index: 'A',
      collection: 'contest',
      status: 'ready',
      html: 'Translated A',
    }),
  );
});
