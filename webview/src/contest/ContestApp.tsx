import React, { useEffect, useState } from 'react';
import type { ContestHostMessage, ContestViewState } from '../../../src/shared/contest-protocol';
import { submissionLabel } from '../../../src/domain/contest';
import { send } from '../bridge';

export function ContestApp() {
  const [state, setState] = useState<ContestViewState>();
  const [tab, setTab] = useState<'prepare' | 'submissions' | 'rankings'>('prepare');
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
          <p>Prepare contests. Read, code and test locally. No account sign-in.</p>
        </div>
        <button disabled={disabled} onClick={() => send({ type: 'addContest' })}>
          ＋ Add contest
        </button>
      </header>
      <section className="account-bar">
        <span>Anonymous mode · no login or browser connection</span>
        <button disabled={disabled} onClick={() => send({ type: 'watchHandle' })}>
          Track public handle{state?.watchHandle ? ': ' + state.watchHandle : ''}
        </button>
        <p>
          {!state
            ? 'Checking bundled downloader…'
            : state.downloaderReady
              ? 'Built-in public downloads ready. No Python installation or extra downloads needed.'
              : 'Built-in downloader unavailable. Install the CFIDE package for this system/CPU architecture, or import saved problem HTML.'}
        </p>
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
            {(['prepare', 'submissions', 'rankings'] as const).map((value) => (
              <button
                className={tab === value ? '' : 'secondary'}
                key={value}
                onClick={() => setTab(value)}
              >
                {
                  {
                    prepare: 'Problems & preparation',
                    submissions: 'Public submissions',
                    rankings: 'Rankings',
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
                            : !problem.ready
                              ? 'Not downloaded'
                              : state.watchHandle
                                ? 'No recent public submission'
                                : 'No handle tracked'}
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
                        <button
                          className="secondary"
                          disabled={disabled}
                          onClick={() =>
                            send({ type: 'importHtml', contestId: id, index: problem.index })
                          }
                        >
                          Import saved HTML
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
                  disabled={disabled || !state.watchHandle}
                  onClick={() => send({ type: 'refreshStatus', contestId: id })}
                >
                  Refresh submissions
                </button>
                <small>
                  Tracking {state.watchHandle || '(set a handle)'} ·{' '}
                  {updated(state.submissionsUpdatedAt, now)}
                </small>
              </div>
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
                  disabled={!state.watchHandle}
                  onClick={() => send({ type: 'rankFilter', mode: 'nearby', search: '' })}
                >
                  Near tracked handle
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
        </>
      )}
      <footer>
        No login, cookies or managed browser. Submit/register on the official website yourself.
        Public API data may be delayed or unavailable; cached local work is preserved.
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
