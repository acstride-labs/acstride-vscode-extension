import React, { useEffect, useState } from 'react';
import type { ContestHostMessage } from '../../../src/shared/contest-protocol';
import { ContestApp } from './ContestApp';
import { StatementView } from '../statement/StatementView';
import { send } from '../bridge';
import { useI18n } from '../i18n';
export function ContestPage() {
  const { t } = useI18n();
  const [state, setState] =
    useState<Extract<ContestHostMessage, { type: 'contestState' }>['state']>();
  const [index, setIndex] = useState('');
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data.type === 'contestState') setState(event.data.state);
      if (event.data.type === 'statement') setIndex(event.data.index);
      if (event.data.type === 'contestOverview') setIndex('');
    };
    window.addEventListener('message', listener);
    send({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, []);
  const record = state?.contests.find((c) => c.contest.id === state.selectedId);
  return (
    <main className="answer-pane contest-file">
      <nav className="problem-rail" aria-label={t('Problems')}>
        <button
          aria-label={t('Open contest details')}
          title={t('Open contest details')}
          aria-current={!index ? 'page' : undefined}
          onClick={() =>
            record && send({ type: 'openContestDetails', contestId: record.contest.id })
          }
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          >
            <path d="M2 17h16M3.5 16V9h4v7M8 16V4h4v12M12.5 16V11h4v5" />
          </svg>
        </button>
        {record?.problems.map((p) => (
          <button
            key={p.index}
            title={p.name}
            aria-current={index === p.index ? 'page' : undefined}
            onClick={() =>
              send({ type: 'openProblem', contestId: record.contest.id, index: p.index })
            }
          >
            {p.index}
          </button>
        ))}
      </nav>
      <div className="contest-file-content">
        <div hidden={!!index}>
          <ContestApp />
        </div>
        <div hidden={!index}>
          <StatementView />
        </div>
      </div>
    </main>
  );
}
