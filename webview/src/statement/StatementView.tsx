import React, { useEffect, useRef, useState } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';
import type { ContestHostMessage } from '../../../src/shared/contest-protocol';
import { send } from '../bridge';
import { useI18n } from '../i18n';
export function StatementView() {
  const { t } = useI18n();
  const [data, setData] = useState<Extract<ContestHostMessage, { type: 'statement' }>>();
  const content = useRef<HTMLDivElement>(null),
    key = useRef('');
  const scroll = useRef(new Map<string, number>());
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const listener = (event: MessageEvent<ContestHostMessage>) => {
      if (event.data.type !== 'statement') return;
      scroll.current.set(key.current, viewport.current?.scrollTop ?? 0);
      key.current = `${event.data.contestId}/${event.data.index}`;
      setData(event.data);
    };
    window.addEventListener('message', listener);
    send({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, []);
  useEffect(() => {
    if (!content.current || !data) return;
    renderMathInElement(content.current, {
      delimiters: [
        { left: '$$$', right: '$$$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
      trust: false,
    });
    if (viewport.current) viewport.current.scrollTop = scroll.current.get(key.current) || 0;
  }, [data]);
  return (
    <main className="answer-pane">
      <nav className="problem-rail" aria-label={t('Problems')}>
        {data?.problems.map((problem) => (
          <button
            key={problem.index}
            aria-current={data.index === problem.index ? 'page' : undefined}
            title={`${problem.index} · ${problem.name}`}
            onClick={() =>
              send({ type: 'openProblem', contestId: data.contestId, index: problem.index })
            }
          >
            {problem.index}
          </button>
        ))}
      </nav>
      <div className="statement-pane">
        <header className="answer-toolbar">
          <span>{data ? `#${data.contestId} · ${data.index}` : t('STATEMENT')}</span>
          <button
            className="secondary"
            disabled={!data}
            onClick={() => send({ type: 'switchLanguage' })}
            title={t('Switch language')}
          >
            {data?.language === 'python' ? 'Python 3' : 'C++'} ▾
          </button>
        </header>
        <div className="statement-scroll" ref={viewport}>
          {data?.statement.imageWarning && (
            <p className="error">{t(data.statement.imageWarning)}</p>
          )}
          <div
            ref={content}
            className="statement"
            dangerouslySetInnerHTML={{ __html: data?.statement.html ?? '' }}
          />
        </div>
      </div>
    </main>
  );
}
