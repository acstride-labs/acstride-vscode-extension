import { matchesSubmissionLanguage } from '../domain/languages';
import * as vscode from 'vscode';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CfToolClient, CfToolError } from '../infrastructure/codeforces/cf-tool-client';
import type { Problem } from '../domain/models';
import { submissionLabel } from '../domain/contest';
import type { AccountState } from '../shared/protocol';
import { t } from './localization';

export interface SubmissionSnapshot {
  problem: Problem;
  file: string;
  source: string;
  assertCurrent(): void;
}
const pendingSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{32}$/),
  handle: z.string().regex(/^[A-Za-z0-9_.-]{1,24}$/),
  contestId: z.number().int().positive(),
  index: z.string().regex(/^[A-Z][0-9]{0,2}$/),
  submissionId: z.number().int().positive().optional(),
  lastVerdict: z.string().optional(),
});
type Pending = z.infer<typeof pendingSchema>;
const storageKey = 'cfide.pendingSubmissions';

export class SubmissionController implements vscode.Disposable {
  accountState: AccountState = { status: 'checking' };
  private accountListeners = new Set<() => void>();
  private refreshing?: Promise<void>;
  private accountBusy = false;
  onAccountChanged(listener: () => void) {
    this.accountListeners.add(listener);
    return {
      dispose: () => {
        this.accountListeners.delete(listener);
      },
    };
  }
  private accountError(error: unknown) {
    return error instanceof CfToolError && error.code === 'verification_required'
      ? t(
          'Codeforces requires website verification. Sign-in is temporarily unavailable; you can keep using the other features.',
        )
      : error instanceof Error
        ? error.message
        : String(error);
  }
  private setAccount(account: AccountState) {
    this.accountState = account;
    for (const listener of this.accountListeners) listener();
  }
  refreshAccount() {
    if (this.accountBusy) return Promise.resolve();
    if (this.refreshing) return this.refreshing;
    this.setAccount({ status: 'checking' });
    this.refreshing = this.tool
      .account()
      .then(
        (account) => {
          this.setAccount({ status: 'signedIn', handle: account.handle });
        },
        (error) => {
          this.setAccount({
            status: 'signedOut',
            error:
              error instanceof CfToolError &&
              ['not_authenticated', 'session_unavailable', 'invalid_session'].includes(error.code)
                ? undefined
                : this.accountError(error),
          });
        },
      )
      .finally(() => {
        this.refreshing = undefined;
      });
    return this.refreshing;
  }
  private preparing = false;
  private pending: Pending[];
  private tracking = new Set<string>();
  private stopped = false;
  private writes: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setInterval>;
  constructor(
    private context: vscode.ExtensionContext,
    private tool: CfToolClient,
  ) {
    const parsed = z.array(pendingSchema).safeParse(context.globalState.get(storageKey, []));
    this.pending = parsed.success ? parsed.data : [];
    this.timer = setInterval(() => this.poll(), 15000);
    this.poll();
  }
  private persist() {
    const snapshot = this.pending.map((p) => ({ ...p }));
    this.writes = this.writes
      .catch(() => {})
      .then(() => this.context.globalState.update(storageKey, snapshot));
    return this.writes;
  }
  async signIn() {
    if (this.accountBusy) return;
    this.accountBusy = true;
    await this.refreshing;
    const previous = this.accountState;
    this.setAccount({ status: 'checking' });
    try {
      const username = await vscode.window.showInputBox({
        title: t('Sign in to Codeforces'),
        prompt: t('Codeforces username'),
        ignoreFocusOut: true,
      });
      if (!username) {
        this.setAccount(previous.status === 'checking' ? { status: 'signedOut' } : previous);
        return;
      }
      const password = await vscode.window.showInputBox({
        title: t('Sign in to Codeforces'),
        prompt: t('Codeforces password'),
        password: true,
        ignoreFocusOut: true,
      });
      if (!password) {
        this.setAccount(previous.status === 'checking' ? { status: 'signedOut' } : previous);
        return;
      }
      const account = await this.tool.login(username, password);
      this.setAccount({ status: 'signedIn', handle: account.handle });
      this.poll();
      return account;
    } catch (error) {
      this.setAccount({
        status: 'signedOut',
        error: this.accountError(error),
      });
      throw error;
    } finally {
      this.accountBusy = false;
    }
  }
  async signOut() {
    if (this.accountBusy) return;
    this.accountBusy = true;
    await this.refreshing;
    const previous = this.accountState;
    this.setAccount({ status: 'checking' });
    try {
      await this.tool.forgetSession();
      this.setAccount({ status: 'signedOut' });
    } catch (error) {
      this.setAccount(previous);
      throw error;
    } finally {
      this.accountBusy = false;
    }
  }
  async submit(snapshot: SubmissionSnapshot) {
    if (this.preparing) return;
    const { problem, file, source } = snapshot;
    if (!problem.contestId) throw new Error(t('Only Codeforces problems can be submitted.'));
    if (
      this.pending.some(
        (p) => p.contestId === problem.contestId && p.index === problem.id && !p.submissionId,
      )
    )
      throw new Error(
        t('A submission for this problem is still being verified or judged. Do not submit again.'),
      );
    this.preparing = true;
    try {
      await this.refreshAccount();
      if (this.accountState.status !== 'signedIn')
        throw new Error(t('Sign in on the Settings page to enable one-click submission.'));
      const account = { handle: this.accountState.handle! };
      const offered = await this.tool.languages(problem.contestId);
      const choices = offered.filter((language) =>
        matchesSubmissionLanguage(problem.language, language.name),
      );
      if (!choices.length)
        throw new Error(t('No matching submission language is available for this solution.'));
      const language = await vscode.window.showQuickPick(
        choices.map((l) => ({ label: l.name, id: l.id })),
        { title: t('Choose submission language'), ignoreFocusOut: true },
      );
      if (!language) return;
      snapshot.assertCurrent();
      const confirmed = await vscode.window.showWarningMessage(
        t('Submit {problem} to Codeforces?', { problem: `${problem.contestId}${problem.id}` }),
        {
          modal: true,
          detail: t(
            'Account: {handle}\nLanguage: {language}\nFile: {file}\nThis uploads the saved code to Codeforces. Submission is experimental; website verification may prevent it.',
            { handle: account.handle, language: language.label, file: path.basename(file) },
          ),
        },
        t('Confirm submission'),
      );
      if (confirmed !== t('Confirm submission')) return;
      snapshot.assertCurrent();
      const hash = createHash('sha256').update(source).digest('hex');
      const receipt = await this.tool.submit(
        problem.contestId,
        problem.id,
        file,
        language.id,
        hash,
        account.handle,
      );
      if (
        receipt.handle.toLowerCase() !== account.handle.toLowerCase() ||
        receipt.contestId !== problem.contestId ||
        receipt.index !== problem.id ||
        receipt.languageId !== language.id ||
        receipt.sha256 !== hash
      )
        throw new Error(
          t(
            'The submission receipt does not match the confirmed solution. Check Codeforces before retrying.',
          ),
        );
      const pending: Pending = {
        id: receipt.id,
        handle: receipt.handle,
        contestId: receipt.contestId,
        index: receipt.index,
        submissionId: receipt.submissionId,
      };
      this.pending.push(pending);
      await this.persist();
      void vscode.window.showInformationMessage(
        t('Submission result is being verified. Do not submit again.'),
      );
      void this.track(pending);
    } finally {
      this.preparing = false;
    }
  }
  private poll() {
    if (this.stopped) return;
    for (const item of this.pending) void this.track(item);
  }
  private async track(item: Pending) {
    if (this.stopped || this.tracking.has(item.id)) return;
    this.tracking.add(item.id);
    try {
      if (!item.submissionId) {
        const receipt = await this.tool.reconcile(item.id);
        if (
          receipt.id !== item.id ||
          receipt.handle.toLowerCase() !== item.handle.toLowerCase() ||
          receipt.contestId !== item.contestId ||
          receipt.index !== item.index
        )
          return;
        if (receipt.state !== 'confirmed' || !receipt.submissionId) return;
        item.submissionId = receipt.submissionId;
        await this.persist();
      }
      const result = await this.tool.watch(item.contestId, item.handle, item.submissionId);
      if (
        this.stopped ||
        result.id !== item.submissionId ||
        result.problem.index !== item.index ||
        ['TESTING', 'SUBMITTED'].includes(result.verdict)
      )
        return;
      const signature = `${result.verdict}/${result.testset ?? ''}`;
      if (item.lastVerdict !== signature) {
        item.lastVerdict = signature;
        const message = t('Codeforces {problem}: {verdict} (#{submissionId})', {
          problem: `${item.contestId}${item.index}`,
          verdict: t(submissionLabel(result)),
          submissionId: result.id,
        });
        if (result.verdict === 'OK') void vscode.window.showInformationMessage(message);
        else void vscode.window.showWarningMessage(message);
      }
      if (!(result.verdict === 'OK' && result.testset === 'PRETESTS'))
        this.pending = this.pending.filter((p) => p.id !== item.id);
      await this.persist();
    } catch {
      /* Retain receipts across transient failures/restarts; never resend a POST. */
    } finally {
      this.tracking.delete(item.id);
    }
  }
  dispose() {
    this.stopped = true;
    clearInterval(this.timer);
    this.accountListeners.clear();
  }
}
