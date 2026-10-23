import React, { useEffect, useState } from 'react';
import type { ContestHostMessage, ContestViewState } from '../../../src/shared/contest-protocol';
import { submissionLabel } from '../../../src/domain/contest';
import { send } from '../bridge';

export function ContestApp() {
  const [state, setState] = useState<ContestViewState>();
  const [tab, setTab] = useState<'prepare' | 'submissions' | 'rankings' | 'messages'>('prepare');
  const [search, setSearch] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const listener = (event: MessageEvent<ContestHostMessage>) => {
      if (event.data.type === 'contestState') {
        setState(event.data.state);
        setOffset(event.data.state.serverNow - Date.now());
      }
    };
    window.addEventListener('message', listener);
    send({ type: 'ready' });
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      window.removeEventListener('message', listener);
      clearInterval(timer);
    };
  }, []);
  const record = state?.contests.find((c) => c.contest.id === state.selectedId);
  const contest = record?.contest;
  const now = clock + offset;
  const countdown = contest?.startTimeSeconds
    ? (contest.startTimeSeconds * 1000 > now
        ? contest.startTimeSeconds * 1000
        : (contest.startTimeSeconds + contest.durationSeconds) * 1000) - now
    : 0;
  const id = state?.selectedId;
  const disabled = !!state?.busy;
  return (
    <main className="contest-center">
      <header className="center-header">
        <div>
          <span className="eyebrow">CFIDE / CONTEST CENTER</span>
          <h1>Your contest workspace</h1>
          <p>Prepare once. Read, code, test and submit here.</p>
        </div>
        <button disabled={disabled} onClick={() => send({ type: 'addContest' })}>
          ＋ Add contest
        </button>
      </header>
      <section className="account-bar">
        <span>
          {state?.signedInHandle
            ? `Signed in as ${state.signedInHandle}`
            : 'Not signed in to Codeforces'}
        </span>
        {!state?.signedInHandle ? (
          <button disabled={disabled} onClick={() => send({ type: 'login' })}>
            {state?.connectionMode === 'browser' ? '1. Open dedicated Chrome' : 'Sign in'}
          </button>
        ) : (
          <button
            className="secondary"
            disabled={disabled}
            onClick={() => send({ type: 'logout' })}
          >
            {state?.connectionMode === 'browser' ? 'Disconnect browser' : 'Sign out'}
          </button>
        )}
        {state?.connectionMode === 'browser' && (
          <>
            <button disabled={disabled} onClick={() => send({ type: 'connectBrowser' })}>
              2. Connect after sign-in
            </button>
            <p>
              {state.browserConnected
                ? 'Dedicated browser connected. Keep it open during the contest.'
                : 'Browser not connected. Sign in manually in the dedicated Chrome window, then connect. No browser extension is required.'}
            </p>
            {state.browserConnected && !state.signedInHandle && (
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => send({ type: 'logout' })}
              >
                Disconnect browser
              </button>
            )}
          </>
        )}
        <button
          className="secondary"
          disabled={disabled}
          onClick={() => send({ type: 'watchHandle' })}
        >
          Track handle{state?.watchHandle ? `: ${state.watchHandle}` : ''}
        </button>
        {state?.connectionMode === 'http' && (
          <details>
            <summary>Session troubleshooting</summary>
            <p>
              If normal sign-in requires website verification, an existing authenticated Cookie
              header can be connected. It is stored in VS Code SecretStorage, never in this
              workspace.
            </p>
            <button disabled={disabled} onClick={() => send({ type: 'connectCookie' })}>
              Connect existing session
            </button>
          </details>
        )}
      </section>
      <label className="contest-picker">
        Current contest
        <select
          aria-label="Current contest"
          value={id ?? ''}
          onChange={(e) => send({ type: 'selectContest', contestId: Number(e.target.value) })}
        >
          <option value="" disabled>
            Select a contest
          </option>
          {state?.contests.map((c) => (
            <option key={c.contest.id} value={c.contest.id}>
              {c.archived ? '[Archived] ' : ''}
              {c.contest.id} · {c.contest.name}
            </option>
          ))}
        </select>
      </label>
      {state?.error && (
        <pre className="error" role="alert">
          {state.error}
        </pre>
      )}
      {state?.busy && <p role="status">{state.busy}</p>}
      {!record && (
        <section className="card">
          <h2>Start with a contest link</h2>
          <p>
            Add a regular Codeforces contest URL or ID. Upcoming contests are monitored while this
            VS Code window is running. Existing contests can be imported for practice.
          </p>
          <p>Adding a contest locally does not register you on Codeforces.</p>
        </section>
      )}
      {state && record && contest && id && (
        <>
          <section className="contest-heading">
            <div>
              <h2>{contest.name}</h2>
              <p>
                #{id} · {contest.phase.replaceAll('_', ' ')} · {contest.type}
                {contest.frozen ? ' · Standings frozen' : ''}
                {record.archived ? ' · Archived' : ''}
              </p>
            </div>
            <div className="countdown">
              <small>
                {contest.phase === 'FINISHED'
                  ? 'Contest ended'
                  : contest.startTimeSeconds && now < contest.startTimeSeconds * 1000
                    ? 'Starts in'
                    : 'Remaining'}
              </small>
              <strong>{duration(countdown)}</strong>
            </div>
          </section>
          <nav className="tabs" aria-label="Contest sections">
            {(['prepare', 'submissions', 'rankings', 'messages'] as const).map((value) => (
              <button
                className={tab === value ? '' : 'secondary'}
                key={value}
                onClick={() => setTab(value)}
              >
                {
                  {
                    prepare: 'Problems & preparation',
                    submissions: 'My submissions',
                    rankings: 'Rankings',
                    messages: 'Registration & messages',
                  }[value]
                }
              </button>
            ))}
          </nav>
          {tab === 'prepare' && (
            <>
              <section className="card preparation">
                <label>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={record.autoDownload}
                    onChange={(e) =>
                      send({ type: 'autoDownload', contestId: id, enabled: e.target.checked })
                    }
                  />{' '}
                  Automatically download problems at start
                </label>
                <label>
                  Default language
                  <select
                    disabled={disabled}
                    value={record.defaultLanguage}
                    onChange={(e) =>
                      send({
                        type: 'defaultLanguage',
                        contestId: id,
                        language: e.target.value as 'cpp' | 'python',
                      })
                    }
                  >
                    <option value="cpp">C++</option>
                    <option value="python">Python 3</option>
                  </select>
                </label>
                <div className="actions">
                  <button
                    disabled={disabled}
                    onClick={() => send({ type: 'syncContest', contestId: id })}
                  >
                    Download / retry missing problems
                  </button>
                  <button
                    className="secondary"
                    disabled={disabled}
                    onClick={() =>
                      send({ type: 'checkEnvironment', language: record.defaultLanguage })
                    }
                  >
                    Check environment
                  </button>
                  <button
                    className="secondary"
                    disabled={disabled}
                    onClick={() =>
                      send({ type: 'archive', contestId: id, archived: !record.archived })
                    }
                  >
                    {record.archived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
                <p>
                  {record.problems.filter((p) => p.ready).length}/{record.problems.length || '?'}{' '}
                  problems ready.{' '}
                  {record.archived
                    ? 'Automatic background work is paused.'
                    : 'Automatic downloads require VS Code to remain open; overdue imports resume after reopening.'}
                </p>
                {record.error && <p className="error">{record.error}</p>}
              </section>
              <div className="problem-grid">
                {record.problems.map((problem) => {
                  const submission = state.submissions.find(
                    (s) => s.problem.index === problem.index,
                  );
                  return (
                    <section className="card problem-card" key={problem.index}>
                      <div className="card-title">
                        <h2>
                          {problem.index} · {problem.name}
                        </h2>
                        <span className="badge">
                          {submission
                            ? submissionLabel(submission)
                            : problem.ready
                              ? 'Not submitted'
                              : 'Not downloaded'}
                        </span>
                      </div>
                      {problem.error && <p className="error">{problem.error}</p>}
                      <div className="actions">
                        <button
                          disabled={disabled}
                          onClick={() =>
                            send({ type: 'openProblem', contestId: id, index: problem.index })
                          }
                        >
                          {problem.ready ? 'Open solution' : 'Open local solution (no statement)'}
                        </button>
                        <button
                          className="secondary"
                          disabled={disabled}
                          onClick={() =>
                            send({ type: 'syncContest', contestId: id, index: problem.index })
                          }
                        >
                          Refresh statement / samples
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>
              {!record.problems.length && (
                <p>
                  {contest.phase === 'BEFORE'
                    ? 'Problem names will appear when Codeforces releases them.'
                    : 'Download available problems to begin.'}
                </p>
              )}
            </>
          )}
          {tab === 'submissions' && (
            <>
              <div className="actions">
                <button
                  disabled={disabled}
                  onClick={() => send({ type: 'refreshStatus', contestId: id })}
                >
                  Refresh submissions
                </button>
                <small>
                  Tracking {state.watchHandle || '(set a handle)'} ·{' '}
                  {updated(state.submissionsUpdatedAt, now)}
                </small>
              </div>
              <h3>Local submission receipts</h3>
              <p>
                Every request saves the exact source. An uncertain receipt is not a failed
                submission; verify before retrying.
              </p>
              {state.attempts.map((a) => (
                <section key={a.id} className="card">
                  <div className="card-title">
                    <h2>
                      {a.problemIndex} · {a.programTypeName}
                    </h2>
                    <span className="badge">
                      {a.state}
                      {a.submissionId ? ` · #${a.submissionId}` : ''}
                    </span>
                  </div>
                  <p>
                    {new Date(a.createdAt).toLocaleString()} · {a.handle} · SHA-256{' '}
                    {a.sourceHash.slice(0, 12)}
                  </p>
                  <p>{a.message}</p>
                  <div className="actions">
                    <button
                      className="secondary"
                      onClick={() => send({ type: 'viewSnapshot', contestId: id, attemptId: a.id })}
                    >
                      View submitted source
                    </button>
                    {['sending', 'prepared', 'uncertain'].includes(a.state) && (
                      <button
                        disabled={disabled}
                        onClick={() =>
                          send({ type: 'resolveAttempt', contestId: id, attemptId: a.id })
                        }
                      >
                        Resolve receipt
                      </button>
                    )}
                  </div>
                </section>
              ))}
              <h3>Official Codeforces submissions</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Problem</th>
                      <th>Language</th>
                      <th>Verdict</th>
                      <th>Tests</th>
                      <th>Time</th>
                      <th>Memory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.submissions.map((s) => (
                      <tr key={s.id}>
                        <td>{s.id}</td>
                        <td>{s.problem.index}</td>
                        <td>{s.programmingLanguage}</td>
                        <td>{submissionLabel(s)}</td>
                        <td>
                          {s.testset} · {s.passedTestCount ?? 0}
                        </td>
                        <td>{s.timeConsumedMillis ?? '—'} ms</td>
                        <td>
                          {s.memoryConsumedBytes === undefined
                            ? '—'
                            : `${Math.round(s.memoryConsumedBytes / 1024)} KB`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'rankings' && (
            <>
              <div className="actions">
                <button
                  disabled={disabled}
                  onClick={() => send({ type: 'refreshStandings', contestId: id })}
                >
                  Refresh rankings
                </button>
                <button
                  className="secondary"
                  onClick={() => send({ type: 'rankFilter', mode: 'all', search: '' })}
                >
                  Top 100
                </button>
                <button
                  className="secondary"
                  onClick={() => send({ type: 'rankFilter', mode: 'nearby', search: '' })}
                >
                  Near me
                </button>
              </div>
              <form
                className="actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  send({ type: 'rankFilter', mode: 'search', search });
                }}
              >
                <input
                  aria-label="Search ranked handle"
                  placeholder="Search handle"
                  value={search}
                  maxLength={64}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="secondary" type="submit">
                  Search
                </button>
              </form>
              <p>
                {updated(state.rankingsUpdatedAt, now)} · {state.rankTotal} participants · Showing
                at most 100 rows. Official scores are displayed without local re-scoring.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Handle</th>
                      <th>Points</th>
                      <th>Penalty</th>
                      {state.rankProblemIndices.map((index) => (
                        <th key={index}>{index}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.map((row, i) => (
                      <tr
                        className={
                          row.handles.some(
                            (h) => h.toLowerCase() === state.watchHandle?.toLowerCase(),
                          )
                            ? 'my-rank'
                            : ''
                        }
                        key={`${row.handles.join('/')}-${i}`}
                      >
                        <td>{row.rank}</td>
                        <td>{row.handles.join(', ')}</td>
                        <td>{row.points}</td>
                        <td>{row.penalty}</td>
                        {row.problemResults.map((p, j) => (
                          <td
                            key={j}
                            title={`${p.type} · ${p.rejectedAttemptCount} rejected attempts`}
                          >
                            {p.points || '—'}
                            {p.rejectedAttemptCount ? ` (${p.rejectedAttemptCount})` : ''}
                            {p.type === 'PRELIMINARY' && p.points > 0 ? ' *' : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!state.rows.length && (
                <p>
                  No rows available for this filter. Standings may be unavailable before the start
                  or hidden/frozen by Codeforces.
                </p>
              )}
            </>
          )}
          {tab === 'messages' && (
            <>
              <section className="card">
                <h2>Official registration</h2>
                <p>
                  Local contest setup is not official registration. Check the response below before
                  relying on your registration status.
                </p>
                <div className="actions">
                  <button
                    disabled={disabled}
                    onClick={() => send({ type: 'registration', contestId: id, register: false })}
                  >
                    Check registration page
                  </button>
                  <button
                    className="secondary"
                    disabled={disabled || !state.signedInHandle}
                    onClick={() => send({ type: 'registration', contestId: id, register: true })}
                  >
                    Request registration
                  </button>
                </div>
                <pre>{state.registration || 'Not checked.'}</pre>
              </section>
              <section className="card">
                <h2>Contest messages</h2>
                <button
                  disabled={disabled}
                  onClick={() => send({ type: 'announcements', contestId: id })}
                >
                  Refresh messages
                </button>
                <pre>
                  {state.announcements ||
                    'Not loaded. This version extracts recognizable public notices; a full clarification workflow is not available yet.'}
                </pre>
              </section>
            </>
          )}
        </>
      )}
      <footer>
        {state?.connectionMode === 'browser'
          ? 'Sign in only in the dedicated browser. Its profile stores the session; Disconnect does not sign out of the website. '
          : 'Passwords are not stored. Session cookies are kept in VS Code SecretStorage. '}{' '}
        API reads are throttled; network failures retain cached work.
      </footer>
    </main>
  );
}
function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function updated(time: number, now: number) {
  return time
    ? `Updated ${new Date(time).toLocaleTimeString()}${now - time > 60000 ? ' · cached / may be stale' : ''}`
    : 'Not synchronized';
}
