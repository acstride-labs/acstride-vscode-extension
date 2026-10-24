import React, { useEffect, useState } from 'react';
import type { ContestHostMessage, ContestViewState } from '../../../src/shared/contest-protocol';
import { submissionLabel } from '../../../src/domain/contest';
import { send } from '../bridge';
import { useI18n } from '../i18n';

export function ContestApp() {
  const { locale, t } = useI18n();
  const [state, setState] = useState<ContestViewState>();
  const [tab, setTab] = useState<'submissions' | 'rankings'>('rankings');
  const [search, setSearch] = useState('');
  const [clock, setClock] = useState(Date.now()),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    const listener = (event: MessageEvent<ContestHostMessage>) => {
      if (event.data.type === 'contestState') {
        setState(event.data.state);
        if (event.data.state.section && event.data.state.section !== 'prepare')
          setTab(event.data.state.section);
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
  const record = state?.contests.find((c) => c.contest.id === state.selectedId),
    contest = record?.contest;
  const now = clock + offset,
    id = state?.selectedId,
    disabled = !!state?.busy;
  const countdown = contest?.startTimeSeconds
    ? (contest.startTimeSeconds * 1000 > now
        ? contest.startTimeSeconds * 1000
        : (contest.startTimeSeconds + contest.durationSeconds) * 1000) - now
    : 0;
  const updated = (time: number) =>
    time
      ? t('Updated {time}', { time: new Date(time).toLocaleTimeString(locale) }) +
        (now - time > 60000 ? ' · ' + t('Cached / may be stale') : '')
      : t('Not synchronized');
  return (
    <main className="contest-center">
      <header className="center-header">
        <div>
          <h1>
            {t('Your contest workspace')}{' '}
            {contest && (
              <span className="contest-time-label">
                {contest.phase === 'FINISHED' || (countdown <= 0 && contest.phase !== 'BEFORE')
                  ? t('FINISHED')
                  : `${t(contest.phase === 'BEFORE' ? 'Starts in' : 'Remaining')} ${duration(countdown)}`}
              </span>
            )}
          </h1>
        </div>
        <button disabled={disabled} onClick={() => send({ type: 'addContest' })}>
          ＋ {t('Add contest')}
        </button>
      </header>
      <label className="contest-picker">
        {t('Current contest')}
        <select
          disabled={disabled}
          aria-label={t('Current contest')}
          value={id ?? ''}
          onChange={(e) => send({ type: 'selectContest', contestId: Number(e.target.value) })}
        >
          <option value="" disabled>
            {t('Select a contest')}
          </option>
          {state?.contests.map((c) => (
            <option key={c.contest.id} value={c.contest.id}>
              {c.archived ? `[${t('Archived')}] ` : ''}
              {c.contest.id} · {c.contest.name}
            </option>
          ))}
        </select>
      </label>
      {state?.error && (
        <pre className="error" role="alert">
          {t(state.error)}
        </pre>
      )}
      {state?.refreshNotice && (
        <p className="refresh-notice" role="status">
          {t(state.refreshNotice)}
        </p>
      )}
      {state?.busy && <p role="status">{t(state.busy)}</p>}
      {!record && (
        <section className="card">
          <h2>{t('Start with a contest link')}</h2>
          <p>
            {t(
              'Add a regular Codeforces contest URL or ID. Upcoming contests are monitored while this VS Code window is running. Existing contests can be imported for practice.',
            )}
          </p>
          <p>{t('Adding a contest locally does not register you on Codeforces.')}</p>
        </section>
      )}
      {state && record && contest && id && (
        <>
          <section className="contest-heading">
            <div>
              <h2>{contest.name}</h2>
              <p>
                #{id} · {t(contest.phase)} · {contest.type}
                {contest.frozen ? ' · ' + t('Standings frozen') : ''}
                {record.archived ? ' · ' + t('Archived') : ''}
              </p>
            </div>
          </section>
          <nav className="tabs" aria-label={t('Contest sections')}>
            {(['submissions', 'rankings'] as const).map((value) => (
              <button
                className={tab === value ? '' : 'secondary'}
                key={value}
                onClick={() => {
                  setTab(value);
                  send({ type: 'contestSection', section: value });
                }}
              >
                {t(
                  {
                    submissions: 'Public submissions',
                    rankings: 'Rankings',
                  }[value],
                )}
              </button>
            ))}
          </nav>
          {tab === 'submissions' && (
            <>
              <div className="actions">
                <button
                  disabled={disabled || !state.watchHandle}
                  onClick={() => send({ type: 'refreshStatus', contestId: id })}
                >
                  {t('Refresh submissions')}
                </button>
                <small>
                  {state.watchHandle
                    ? t('Tracking {handle}', { handle: state.watchHandle })
                    : t('Set a public handle in Settings to track submissions.')}{' '}
                  · {updated(state.submissionsUpdatedAt)}
                </small>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {['ID', 'Problem', 'Language', 'Verdict', 'Tests', 'Time', 'Memory'].map(
                        (key) => (
                          <th key={key}>{t(key)}</th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {state.submissions.map((s) => (
                      <tr key={s.id}>
                        <td>{s.id}</td>
                        <td>{s.problem.index}</td>
                        <td>{s.programmingLanguage}</td>
                        <td>{t(submissionLabel(s))}</td>
                        <td>
                          {t(s.testset ?? '')} · {s.passedTestCount ?? 0}
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
                  {t('Refresh rankings')}
                </button>
                <button
                  className="secondary"
                  onClick={() => send({ type: 'rankFilter', mode: 'all', search: '' })}
                >
                  {t('Top 100')}
                </button>
                <button
                  className="secondary"
                  disabled={!state.watchHandle}
                  onClick={() => send({ type: 'rankFilter', mode: 'nearby', search: '' })}
                >
                  {t('Near tracked handle')}
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
                  aria-label={t('Search ranked handle')}
                  placeholder={t('Search handle')}
                  value={search}
                  maxLength={64}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="secondary" type="submit">
                  {t('Search')}
                </button>
              </form>
              <p>
                {updated(state.rankingsUpdatedAt)} ·{' '}
                {t('{count} participants', { count: state.rankTotal })}
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {['Rank', 'Handle', 'Points', 'Penalty'].map((key) => (
                        <th key={key}>{t(key)}</th>
                      ))}
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
                            title={t('{type} · {count} rejected attempts', {
                              type: t(p.type),
                              count: p.rejectedAttemptCount,
                            })}
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
                  {t(
                    'No rows available for this filter. Standings may be unavailable before the start or hidden/frozen by Codeforces.',
                  )}
                </p>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
