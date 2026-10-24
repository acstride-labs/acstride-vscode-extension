import { Tabs } from '../ui/Tabs';
import {
  VscodeBadge,
  VscodeProgressRing,
  VscodeButton,
  VscodeTable,
  VscodeTableBody,
  VscodeTableCell,
  VscodeTableHeader,
  VscodeTableHeaderCell,
  VscodeTableRow,
  VscodeTextfield,
  valueOf,
} from '../ui';
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
      {state?.busy && (
        <p role="status" className="loading-status">
          <VscodeProgressRing />
          {t(state.busy)}
        </p>
      )}
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
              <h1>
                {contest.name}
                <VscodeBadge className="contest-time-label">
                  {contest.phase === 'FINISHED' || (countdown <= 0 && contest.phase !== 'BEFORE')
                    ? t('FINISHED')
                    : `${t(contest.phase === 'BEFORE' ? 'Starts in' : 'Remaining')} ${duration(countdown)}`}
                </VscodeBadge>
              </h1>
              <p>
                #{id}
                {contest.frozen ? ' · ' + t('Standings frozen') : ''}
                {record.archived ? ' · ' + t('Archived') : ''}
              </p>
            </div>
          </section>
          <Tabs
            value={tab}
            onChange={(value) => {
              setTab(value);
              send({ type: 'contestSection', section: value });
            }}
            label={t('Contest sections')}
            items={[
              {
                value: 'submissions',
                label: t('Public submissions'),
                content: (
                  <>
                    <div className="actions">
                      <small>
                        {state.watchHandle
                          ? t('Tracking {handle}', { handle: state.watchHandle })
                          : t('Set a public handle in Settings to track submissions.')}{' '}
                        · {updated(state.submissionsUpdatedAt)}
                      </small>
                      <RefreshButton
                        label={t('Refresh submissions')}
                        disabled={disabled || !state.watchHandle}
                        onClick={() => send({ type: 'refreshStatus', contestId: id })}
                      />
                    </div>
                    <div className="table-scroll">
                      <VscodeTable borderedRows>
                        <VscodeTableHeader slot="header">
                          <VscodeTableRow>
                            {[
                              'ID',
                              'Problem',
                              'Language',
                              'Verdict',
                              'Tests',
                              'Time',
                              'Memory',
                            ].map((key) => (
                              <VscodeTableHeaderCell key={key}>{t(key)}</VscodeTableHeaderCell>
                            ))}
                          </VscodeTableRow>
                        </VscodeTableHeader>
                        <VscodeTableBody slot="body">
                          {state.submissions.map((s) => (
                            <VscodeTableRow key={s.id}>
                              <VscodeTableCell>{s.id}</VscodeTableCell>
                              <VscodeTableCell>{s.problem.index}</VscodeTableCell>
                              <VscodeTableCell>{s.programmingLanguage}</VscodeTableCell>
                              <VscodeTableCell>{t(submissionLabel(s))}</VscodeTableCell>
                              <VscodeTableCell>
                                {t(s.testset ?? '')} · {s.passedTestCount ?? 0}
                              </VscodeTableCell>
                              <VscodeTableCell>{s.timeConsumedMillis ?? '—'} ms</VscodeTableCell>
                              <VscodeTableCell>
                                {s.memoryConsumedBytes === undefined
                                  ? '—'
                                  : `${Math.round(s.memoryConsumedBytes / 1024)} KB`}
                              </VscodeTableCell>
                            </VscodeTableRow>
                          ))}
                        </VscodeTableBody>
                      </VscodeTable>
                    </div>
                  </>
                ),
              },
              {
                value: 'rankings',
                label: t('Rankings'),
                content: (
                  <>
                    <div className="actions">
                      <VscodeButton
                        secondary
                        onClick={() => send({ type: 'rankFilter', mode: 'all', search: '' })}
                      >
                        {t('Top 100')}
                      </VscodeButton>
                      <VscodeButton
                        secondary
                        disabled={!state.watchHandle}
                        onClick={() => send({ type: 'rankFilter', mode: 'nearby', search: '' })}
                      >
                        {t('Near tracked handle')}
                      </VscodeButton>
                    </div>
                    <form
                      className="actions"
                      onSubmit={(e) => {
                        e.preventDefault();
                        send({ type: 'rankFilter', mode: 'search', search });
                      }}
                    >
                      <VscodeTextfield
                        label={t('Search ranked handle')}
                        placeholder={t('Search handle')}
                        value={String(search)}
                        maxLength={64}
                        onInput={(e) => setSearch(valueOf(e))}
                      />
                      <VscodeButton secondary type="submit">
                        {t('Search')}
                      </VscodeButton>
                    </form>
                    <p className="contest-update-line">
                      <span>
                        {updated(state.rankingsUpdatedAt)} ·{' '}
                        {t('{count} participants', { count: state.rankTotal })}
                      </span>
                      <RefreshButton
                        label={t('Refresh rankings')}
                        disabled={disabled}
                        onClick={() => send({ type: 'refreshStandings', contestId: id })}
                      />
                    </p>
                    <div className="table-scroll">
                      <VscodeTable borderedRows>
                        <VscodeTableHeader slot="header">
                          <VscodeTableRow>
                            {['Rank', 'Handle', 'Points', 'Penalty'].map((key) => (
                              <VscodeTableHeaderCell key={key}>{t(key)}</VscodeTableHeaderCell>
                            ))}
                            {state.rankProblemIndices.map((index) => (
                              <VscodeTableHeaderCell key={index}>{index}</VscodeTableHeaderCell>
                            ))}
                          </VscodeTableRow>
                        </VscodeTableHeader>
                        <VscodeTableBody slot="body">
                          {state.rows.map((row, i) => (
                            <VscodeTableRow
                              className={
                                row.handles.some(
                                  (h) => h.toLowerCase() === state.watchHandle?.toLowerCase(),
                                )
                                  ? 'my-rank'
                                  : ''
                              }
                              key={`${row.handles.join('/')}-${i}`}
                            >
                              <VscodeTableCell>{row.rank}</VscodeTableCell>
                              <VscodeTableCell>{row.handles.join(', ')}</VscodeTableCell>
                              <VscodeTableCell>{row.points}</VscodeTableCell>
                              <VscodeTableCell>{row.penalty}</VscodeTableCell>
                              {row.problemResults.map((p, j) => (
                                <VscodeTableCell
                                  key={j}
                                  title={t('{type} · {count} rejected attempts', {
                                    type: t(p.type),
                                    count: p.rejectedAttemptCount,
                                  })}
                                >
                                  {p.points || '—'}
                                  {p.rejectedAttemptCount ? ` (${p.rejectedAttemptCount})` : ''}
                                  {p.type === 'PRELIMINARY' && p.points > 0 ? ' *' : ''}
                                </VscodeTableCell>
                              ))}
                            </VscodeTableRow>
                          ))}
                        </VscodeTableBody>
                      </VscodeTable>
                    </div>
                    {!state.rows.length && (
                      <p>
                        {t(
                          'No rows available for this filter. Standings may be unavailable before the start or hidden/frozen by Codeforces.',
                        )}
                      </p>
                    )}
                  </>
                ),
              },
            ]}
          />
        </>
      )}
    </main>
  );
}
function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function RefreshButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <VscodeButton
      type="button"
      secondary
      className="contest-refresh-icon"
      disabled={disabled}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        aria-hidden="true"
      >
        <path d="M13.5 6A5.5 5.5 0 0 0 3 5M2.5 10A5.5 5.5 0 0 0 13 11M3 1.5V5h3.5M13 14.5V11H9.5" />
      </svg>
    </VscodeButton>
  );
}
