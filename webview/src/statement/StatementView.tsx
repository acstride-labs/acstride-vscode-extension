import React, { useEffect, useRef, useState } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';
import type { ContestHostMessage } from '../../../src/shared/contest-protocol';
import { send } from '../bridge';
import { useI18n } from '../i18n';
export function StatementView() {
  const { t } = useI18n();
  const [translated, setTranslated] = useState(false);
  const [translation, setTranslation] = useState<{
    status: string;
    html?: string;
    error?: string;
  }>();
  const [data, setData] = useState<Extract<ContestHostMessage, { type: 'statement' }>>();
  const content = useRef<HTMLDivElement>(null),
    key = useRef('');
  const scroll = useRef(new Map<string, number>());
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const listener = (event: MessageEvent<ContestHostMessage>) => {
      if (event.data.type === 'translation') {
        setTranslation(event.data);
        if (event.data.status === 'disabled') setTranslated(false);
        return;
      }
      if (event.data.type !== 'statement') return;
      if (
        key.current !==
        `${event.data.collection ?? 'contest'}/${event.data.contestId}/${event.data.index}`
      ) {
        setTranslated(false);
        setTranslation(undefined);
      }
      scroll.current.set(key.current, viewport.current?.scrollTop ?? 0);
      key.current = `${event.data.collection ?? 'contest'}/${event.data.contestId}/${event.data.index}`;
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
  }, [data, translation, translated]);
  return (
    <main className="answer-pane">
      <div className="statement-pane">
        <header className="answer-toolbar">
          <div className="statement-identity">
            <span>{data ? `#${data.contestId} · ${data.index}` : t('STATEMENT')}</span>
            <button
              className="secondary translation-toggle"
              title={translated ? '显示原文' : 'AI 题面翻译'}
              aria-label="AI 题面翻译"
              aria-pressed={translated}
              disabled={!data?.statement.fetchedAt}
              onClick={() => {
                setTranslated(!translated);
                if (!translated)
                  data &&
                    send({
                      type: 'translateStatement',
                      contestId: data.contestId,
                      index: data.index,
                      collection: data.collection,
                    });
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                aria-hidden="true"
              >
                <path d="M2 4h9M6.5 2v2M4 4c.5 4 3 6 6 8M9 4c-.5 4-3 7-7 9M10 17l4-10 4 10M11.5 14h5" />
              </svg>
            </button>
          </div>
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
          {translated && translation?.status !== 'ready' && (
            <p role="status">
              {translation?.status === 'failed' ? translation.error : '正在翻译中，请稍候…'}
              {translation?.status === 'failed' && (
                <button
                  onClick={() =>
                    data &&
                    send({
                      type: 'translateStatement',
                      contestId: data.contestId,
                      index: data.index,
                      collection: data.collection,
                    })
                  }
                >
                  重试
                </button>
              )}
            </p>
          )}
          <div
            ref={content}
            className="statement"
            dangerouslySetInnerHTML={{
              __html: translated ? (translation?.html ?? '') : (data?.statement.html ?? ''),
            }}
          />
        </div>
      </div>
    </main>
  );
}
