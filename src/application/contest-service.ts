import type { Language } from '../domain/models';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import type { CFSubmission, ContestRecord, SubmissionAttempt, Statement } from '../domain/contest';
import { ContestRepository } from '../infrastructure/storage/contest-repository';
import type { CodeforcesApi } from '../infrastructure/codeforces/api-client';
import {
  CodeforcesSession,
  SubmissionRejectedError,
} from '../infrastructure/codeforces/session-client';
import { parseStatement } from '../infrastructure/codeforces/statement-parser';

type Api = Pick<CodeforcesApi, 'contest' | 'standings' | 'submissions'>;
type Session = Pick<CodeforcesSession, 'page' | 'submit' | 'handle'>;
export class ContestService {
  private syncing = new Set<number>();
  private polling = new Set<number>();
  private activeSubmits = new Set<string>();
  private stopped = false;
  private tickBusy = false;
  private lastMetadata = 0;
  constructor(
    readonly repository: ContestRepository,
    private api: Api,
    private session: Session,
    private template: (language: Language, index: string) => Promise<string>,
    private changed: (id: number) => void = () => {},
    private cacheStatement: (id: number, statement: Statement) => Promise<Statement> = async (
      _,
      statement,
    ) => statement,
  ) {}
  async add(id: number, language: Language) {
    const record = await this.repository.add(await this.api.contest(id), language);
    this.changed(id);
    return record;
  }
  async ensureSolution(id: number, index: string) {
    const record = await this.repository.get(id);
    const item = record.problems.find((p) => p.index === index);
    if (!item || record.contest.phase === 'BEFORE')
      throw new Error('This problem has not been released by Codeforces.');
    const store = this.repository.problems(id);
    const existing = (await store.listProblems()).find((p) => p.id === index);
    if (existing) return existing;
    try {
      return await store.createProblem(
        index,
        item.name,
        await this.template(record.defaultLanguage, index),
        record.defaultLanguage,
      );
    } catch (error) {
      const concurrent = (await store.listProblems()).find((p) => p.id === index);
      if (concurrent) return concurrent;
      throw error;
    }
  }
  async sync(id: number, onlyIndex?: string) {
    if (this.syncing.has(id) || this.stopped) return;
    this.syncing.add(id);
    try {
      const record = await this.repository.get(id);
      const now = Date.now();
      if (
        record.contest.phase === 'BEFORE' &&
        (!record.contest.startTimeSeconds || now < record.contest.startTimeSeconds * 1000)
      )
        return;
      const board = await this.api.standings(id);
      await this.repository.saveStandings(id, board);
      await this.repository.update(id, (r) => {
        r.contest = board.contest;
        r.updatedAt = now;
        for (const p of board.problems)
          if (!r.problems.some((old) => old.index === p.index))
            r.problems.push({ ...p, ready: false });
      });
      this.changed(id);
      for (const problem of (await this.repository.get(id)).problems) {
        if (this.stopped) return;
        if (onlyIndex ? problem.index !== onlyIndex : problem.ready) continue;
        try {
          // Source creation must not depend on website access. Download failure must not block coding.
          await this.ensureSolution(id, problem.index);
          const url = `/contest/${id}/problem/${encodeURIComponent(problem.index)}`;
          const page = await this.session.page(url);
          const parsed = parseStatement(page.html, `https://codeforces.com${url}`);
          const store = this.repository.problems(id);
          await store.importSamples(problem.index, parsed.samples);
          await this.repository.saveStatement(
            id,
            problem.index,
            await this.cacheStatement(id, parsed.statement),
          );
          await this.repository.update(id, (r) => {
            const p = r.problems.find((p) => p.index === problem.index)!;
            p.ready = true;
            delete p.error;
          });
        } catch (error) {
          await this.repository.update(id, (r) => {
            const p = r.problems.find((p) => p.index === problem.index)!;
            p.error = message(error);
          });
        }
        this.changed(id);
      }
      await this.repository.update(id, (r) => {
        const failed = r.problems.some((p) => !p.ready);
        r.retryCount = failed ? r.retryCount + 1 : 0;
        r.nextRetryAt = failed
          ? Date.now() + Math.min(180000, 15000 * 2 ** Math.min(r.retryCount, 4))
          : 0;
        r.error = failed ? 'Some problems are not ready; automatic retry is scheduled.' : undefined;
      });
    } catch (error) {
      await this.repository.update(id, (r) => {
        r.retryCount++;
        r.nextRetryAt = Date.now() + Math.min(180000, 15000 * 2 ** Math.min(r.retryCount, 4));
        r.error = message(error);
      });
    } finally {
      this.syncing.delete(id);
      this.changed(id);
    }
  }
  async refreshMetadata(id: number) {
    const contest = await this.api.contest(id);
    await this.repository.update(id, (r) => {
      r.contest = contest;
      r.updatedAt = Date.now();
    });
    this.changed(id);
  }
  async tick(now = Date.now()) {
    if (this.stopped || this.tickBusy) return;
    this.tickBusy = true;
    try {
      const records = await this.repository.list();
      const refresh = now - this.lastMetadata >= 60000;
      if (refresh) this.lastMetadata = now;
      for (const record of records) {
        if (this.stopped) return;
        if (record.archived) continue;
        if (refresh && record.contest.phase !== 'FINISHED') {
          try {
            await this.refreshMetadata(record.contest.id);
          } catch {
            /* Keep cached contest information on network failure. */
          }
        }
        const due =
          record.contest.phase !== 'BEFORE' ||
          (!!record.contest.startTimeSeconds && now >= record.contest.startTimeSeconds * 1000);
        if (
          record.autoDownload &&
          due &&
          record.nextRetryAt <= now &&
          (!record.problems.length || record.problems.some((p) => !p.ready))
        )
          await this.sync(record.contest.id);
      }
    } finally {
      this.tickBusy = false;
    }
  }
  async refreshBoard(id: number) {
    const board = await this.api.standings(id);
    await this.repository.saveStandings(id, board);
    this.changed(id);
  }
  async refreshSubmissions(id: number, handle: string) {
    if (this.polling.has(id) || this.stopped) return;
    this.polling.add(id);
    try {
      const submissions = await this.api.submissions(id, handle);
      await this.repository.saveSubmissions(id, handle, submissions);
      for (const attempt of await this.repository.attempts(id)) {
        if (
          attempt.handle.toLowerCase() !== handle.toLowerCase() ||
          !['sending', 'uncertain'].includes(attempt.state)
        )
          continue;
        // Similar timestamps/languages are not proof of identity. They are shown as candidates only.
        const candidates = submissions.filter((s) => candidate(attempt, s));
        const matches: number[] = [];
        let verifiedSources = 0;
        // A receipt can be reconciled only with the authenticated owner's exact source.
        if (
          candidates.length > 0 &&
          candidates.length <= 3 &&
          this.session.handle?.toLowerCase() === handle.toLowerCase()
        ) {
          const local = await fs.readFile(this.repository.snapshotPath(attempt), 'utf8');
          if (createHash('sha256').update(local).digest('hex') === attempt.sourceHash) {
            for (const submission of candidates) {
              try {
                const page = await this.session.page(`/contest/${id}/submission/${submission.id}`);
                const remote = cheerio.load(page.html)('#program-source-text').text();
                if (remote) verifiedSources++;
                if (
                  remote &&
                  remote.replace(/\r\n/g, '\n').trimEnd() === local.replace(/\r\n/g, '\n').trimEnd()
                )
                  matches.push(submission.id);
              } catch {
                /* Leave the receipt uncertain if source verification is unavailable. */
              }
            }
          }
        }
        if (matches.length === 1 && verifiedSources === candidates.length) {
          attempt.state = 'confirmed';
          attempt.submissionId = matches[0];
          attempt.message = 'Receipt reconciled against the official source snapshot.';
          await this.repository.saveAttempt(attempt);
          continue;
        }
        attempt.message = candidates.length
          ? `Receipt uncertain. Candidate submission IDs: ${candidates.map((s) => s.id).join(', ')}. Verify the source before linking.`
          : 'Receipt uncertain. No matching recent submission was found. Do not blindly resubmit.';
        attempt.state = 'uncertain';
        await this.repository.saveAttempt(attempt);
      }
      this.changed(id);
    } finally {
      this.polling.delete(id);
    }
  }
  async submit(
    id: number,
    index: string,
    language: Language,
    programTypeId: string,
    programTypeName: string,
    source: string,
    fields: URLSearchParams,
  ): Promise<SubmissionAttempt> {
    if (this.stopped) throw new Error('The contest workspace has closed.');
    if (!this.session.handle) throw new Error('Sign in to Codeforces first.');
    const key = `${id}/${index}`;
    if (this.activeSubmits.has(key))
      throw new Error('This problem already has a submission request in progress.');
    this.activeSubmits.add(key);
    try {
      const unresolved = (await this.repository.attempts(id)).find(
        (a) =>
          a.problemIndex === index &&
          a.handle.toLowerCase() === this.session.handle!.toLowerCase() &&
          ['prepared', 'sending', 'uncertain'].includes(a.state),
      );
      if (unresolved)
        throw new Error(
          'Resolve the previous uncertain submission in the Submissions tab before submitting again.',
        );
      const recent = await this.api.submissions(id, this.session.handle);
      if (this.stopped)
        throw new Error('The contest workspace has closed. No submission was sent.');
      const attempt = await this.repository.prepareAttempt(
        id,
        index,
        language,
        programTypeId,
        programTypeName,
        this.session.handle,
        source,
      );
      attempt.baselineId = recent.reduce((max, s) => Math.max(max, s.id), 0);
      attempt.state = 'sending';
      await this.repository.saveAttempt(attempt);
      this.changed(id);
      try {
        const receipt = await this.session.submit(id, index, programTypeId, source, fields);
        attempt.submissionId = receipt.submissionId;
        attempt.state = receipt.submissionId ? 'confirmed' : 'uncertain';
        attempt.message =
          receipt.message ||
          (receipt.submissionId
            ? 'Submission received.'
            : 'Receipt uncertain; refreshing your submissions.');
      } catch (error) {
        attempt.state = error instanceof SubmissionRejectedError ? 'rejected' : 'uncertain';
        attempt.message = message(error);
      }
      await this.repository.saveAttempt(attempt);
      this.changed(id);
      return attempt;
    } finally {
      this.activeSubmits.delete(key);
    }
  }
  dispose() {
    this.stopped = true;
  }
}
function candidate(a: SubmissionAttempt, s: CFSubmission) {
  return (
    s.id > (a.baselineId ?? 0) &&
    s.problem.index === a.problemIndex &&
    s.programmingLanguage === a.programTypeName &&
    s.creationTimeSeconds * 1000 >= a.createdAt - 10000 &&
    s.creationTimeSeconds * 1000 <= a.createdAt + 120000
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
