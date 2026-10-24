import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type * as VSCode from 'vscode';
import {
  SubmissionController,
  type SubmissionSnapshot,
} from '../../src/vscode/submission-controller';
import { CfToolError, type CfToolClient } from '../../src/infrastructure/codeforces/cf-tool-client';
const ui = vi.hoisted(() => ({
  warning: vi.fn(),
  info: vi.fn(),
  input: vi.fn(),
  language: vi.fn(),
}));
vi.mock('vscode', () => ({
  env: { language: 'en' },
  workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) },
  window: {
    showWarningMessage: ui.warning,
    showInformationMessage: ui.info,
    showInputBox: ui.input,
    showQuickPick: ui.language,
  },
}));
let managers: SubmissionController[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  ui.warning.mockResolvedValue('Confirm submission');
  ui.info.mockResolvedValue(undefined);
  ui.language.mockResolvedValue({ id: '31', label: 'Python 3' });
});
afterEach(() => {
  for (const manager of managers) manager.dispose();
  managers = [];
});
function fixture(pending: unknown[] = []) {
  const source = 'print(5)\n';
  const hash = createHash('sha256').update(source).digest('hex');
  const receipt = {
    protocol: 1 as const,
    id: 'a'.repeat(32),
    state: 'unknown' as const,
    handle: 'tester',
    contestId: 1,
    index: 'A',
    languageId: '31',
    language: 'Python 3',
    sha256: hash,
    createdAt: new Date().toISOString(),
  };
  const tool = {
    account: vi.fn(async () => ({ handle: 'tester', authenticated: true })),
    login: vi.fn(async () => ({ handle: 'tester', stored: true })),
    languages: vi.fn(async () => [
      { id: '31', name: 'Python 3' },
      { id: '54', name: 'GNU C++17' },
    ]),
    submit: vi.fn(async () => receipt),
    reconcile: vi.fn(async () => ({
      ...receipt,
      id: pending.length ? (pending[0] as { id: string }).id : receipt.id,
      state: pending.length ? 'unknown' : 'confirmed',
      submissionId: pending.length ? undefined : 42,
    })),
    watch: vi.fn(async () => ({
      id: 42,
      contestId: 1,
      problem: { index: 'A' },
      creationTimeSeconds: 1,
      programmingLanguage: 'Python 3',
      verdict: 'OK',
      testset: 'TESTS',
    })),
  };
  let saved = structuredClone(pending);
  const update = vi.fn(async (_key: string, value: unknown[]) => {
    saved = structuredClone(value);
  });
  const context = {
    globalState: { get: () => saved, update },
  } as unknown as VSCode.ExtensionContext;
  const snapshot: SubmissionSnapshot = {
    problem: { id: 'A', title: 'Sum', language: 'python', contestId: 1 },
    file: '/work/main.py',
    source,
    assertCurrent: vi.fn(),
  };
  const manager = new SubmissionController(context, tool as unknown as CfToolClient);
  managers.push(manager);
  return { manager, tool, snapshot, receipt, hash, update, saved: () => saved };
}
it('requires a modal confirmation and never sends when it is cancelled', async () => {
  const f = fixture();
  ui.warning.mockResolvedValue(undefined);
  await f.manager.submit(f.snapshot);
  expect(ui.warning).toHaveBeenCalledWith(
    'Submit 1A to Codeforces?',
    expect.objectContaining({ modal: true, detail: expect.stringContaining('tester') }),
    'Confirm submission',
  );
  expect(f.tool.submit).not.toHaveBeenCalled();
  expect(f.update).not.toHaveBeenCalled();
});
it('binds account, language and source hash, verifies the receipt and notifies the exact submission result', async () => {
  const f = fixture();
  await f.manager.submit(f.snapshot);
  expect(f.tool.submit).toHaveBeenCalledOnce();
  expect(f.tool.submit).toHaveBeenCalledWith(1, 'A', '/work/main.py', '31', f.hash, 'tester');
  await vi.waitFor(() => expect(ui.info).toHaveBeenCalledWith('Codeforces 1A: Accepted (#42)'));
  expect(f.tool.watch).toHaveBeenCalledWith(1, 'tester', 42);
  expect(f.snapshot.assertCurrent).toHaveBeenCalledTimes(2);
  expect(f.saved()).toEqual([]);
});
it('rejects a changed source target after confirmation without sending', async () => {
  const f = fixture();
  vi.mocked(f.snapshot.assertCurrent)
    .mockImplementationOnce(() => {})
    .mockImplementation(() => {
      throw new Error('target changed');
    });
  await expect(f.manager.submit(f.snapshot)).rejects.toThrow('target changed');
  expect(f.tool.submit).not.toHaveBeenCalled();
});
it('restores unresolved receipts after restart without sending or watching an unverified ID', async () => {
  const f = fixture([{ id: 'b'.repeat(32), handle: 'tester', contestId: 1, index: 'A' }]);
  f.tool.reconcile.mockResolvedValue({
    ...f.receipt,
    id: 'b'.repeat(32),
    state: 'unknown',
    submissionId: undefined,
  } as never);
  await vi.waitFor(() => expect(f.tool.reconcile).toHaveBeenCalled());
  expect(f.tool.submit).not.toHaveBeenCalled();
  expect(f.tool.watch).not.toHaveBeenCalled();
  await expect(f.manager.submit(f.snapshot)).rejects.toThrow('still being verified');
});
it('prompts for a private password only when there is no session and never persists credentials', async () => {
  const f = fixture();
  f.tool.account.mockRejectedValue(new CfToolError('session_unavailable', 'missing'));
  ui.input.mockResolvedValueOnce('tester').mockResolvedValueOnce('private-password');
  ui.warning.mockResolvedValue(undefined);
  await f.manager.submit(f.snapshot);
  expect(ui.input.mock.calls[1][0]).toMatchObject({ password: true });
  expect(f.tool.login).toHaveBeenCalledWith('tester', 'private-password');
  expect(JSON.stringify(f.saved())).not.toContain('private-password');
  expect(f.tool.submit).not.toHaveBeenCalled();
});
it('keeps pretests separate from final acceptance and avoids duplicate verdict notifications', async () => {
  const f = fixture();
  f.tool.watch.mockResolvedValue({
    id: 42,
    contestId: 1,
    problem: { index: 'A' },
    creationTimeSeconds: 1,
    programmingLanguage: 'Python 3',
    verdict: 'OK',
    testset: 'PRETESTS',
  });
  f.tool.watch.mockClear();
  await f.manager.submit(f.snapshot);
  await vi.waitFor(() =>
    expect(ui.info).toHaveBeenCalledWith('Codeforces 1A: Pretests passed (#42)'),
  );
  const poll = () => (f.manager as unknown as { poll(): void }).poll();
  poll();
  await vi.waitFor(() => expect(f.tool.watch).toHaveBeenCalledTimes(2));
  expect(ui.info.mock.calls.filter(([m]) => m.includes('Pretests passed'))).toHaveLength(1);
  f.tool.watch.mockResolvedValue({
    id: 42,
    contestId: 1,
    problem: { index: 'A' },
    creationTimeSeconds: 1,
    programmingLanguage: 'Python 3',
    verdict: 'OK',
    testset: 'TESTS',
  });
  poll();
  await vi.waitFor(() => {
    poll();
    expect(ui.info).toHaveBeenCalledWith('Codeforces 1A: Accepted (#42)');
  });
});

it('does not notify or watch a receipt reconciled to another problem', async () => {
  const f = fixture();
  f.tool.reconcile.mockResolvedValue({
    ...f.receipt,
    state: 'confirmed',
    submissionId: 42,
    index: 'B',
  });
  await f.manager.submit(f.snapshot);
  await vi.waitFor(() => expect(f.tool.reconcile).toHaveBeenCalled());
  expect(f.tool.watch).not.toHaveBeenCalled();
  expect(ui.info.mock.calls.some(([message]) => message.includes('Accepted'))).toBe(false);
});

it('coalesces repeated submission clicks while the confirmation flow is running', async () => {
  const f = fixture();
  await Promise.all([f.manager.submit(f.snapshot), f.manager.submit(f.snapshot)]);
  expect(f.tool.submit).toHaveBeenCalledOnce();
});
