import React, { useEffect, useRef, useState } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';
import type { ContestHostMessage } from '../../../src/shared/contest-protocol';
import { send } from '../bridge';
import { useI18n } from '../i18n';
export function StatementView() {
  const { t } = useI18n();
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [translated, setTranslated] = useState(false);
  type Translation = Extract<ContestHostMessage, { type: 'translation' }>;
  const [translation, setTranslation] = useState<Translation>();
  const views = useRef(new Map<string, { translated: boolean; translation?: Translation }>());
  const [data, setData] = useState<Extract<ContestHostMessage, { type: 'statement' }>>();
  const content = useRef<HTMLDivElement>(null),
    key = useRef('');
  const scroll = useRef(new Map<string, number>());
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const listener = (event: MessageEvent<ContestHostMessage>) => {
      if (event.data.type === 'translationAvailability') {
        setTranslationEnabled(event.data.enabled);
        if (!event.data.enabled) {
          setTranslated(false);
          for (const view of views.current.values()) view.translated = false;
          setTranslation(undefined);
        }
        return;
      }
      if (event.data.type === 'translation') {
        const message = event.data;
        const targetKey =
          message.contestId !== undefined && message.index
            ? `${message.collection ?? 'contest'}/${message.contestId}/${message.index}`
            : key.current;
        const view = views.current.get(targetKey) ?? { translated: false };
        view.translation = message;
        if (message.status === 'disabled') view.translated = false;
        views.current.set(targetKey, view);
        if (targetKey === key.current) {
          setTranslation(message);
          setTranslated(view.translated);
        }
        return;
      }
      if (event.data.type !== 'statement') return;
      setTranslationEnabled(event.data.translationEnabled);
      scroll.current.set(key.current, viewport.current?.scrollTop ?? 0);
      key.current = `${event.data.collection ?? 'contest'}/${event.data.contestId}/${event.data.index}`;
      const view = views.current.get(key.current) ?? { translated: false };
      if (!event.data.translationEnabled) view.translated = false;
      views.current.set(key.current, view);
      setTranslated(view.translated);
      setTranslation(view.translation);
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
            <span
              className="translation-action"
              tabIndex={!translationEnabled ? 0 : undefined}
              aria-describedby={!translationEnabled ? 'translation-disabled-hint' : undefined}
            >
              <button
                className="secondary translation-toggle"
                title={
                  translationEnabled
                    ? t(translated ? 'Show original' : 'AI statement translation')
                    : undefined
                }
                aria-label={t('AI statement translation')}
                aria-pressed={translated}
                disabled={!translationEnabled || !data?.statement.fetchedAt}
                onClick={() => {
                  if (!translationEnabled) return;
                  const next = !translated;
                  const view = views.current.get(key.current) ?? { translated: false };
                  view.translated = next;
                  views.current.set(key.current, view);
                  setTranslated(next);
                  if (
                    next &&
                    view.translation?.status !== 'ready' &&
                    view.translation?.status !== 'pending' &&
                    data
                  ) {
                    view.translation = { type: 'translation', status: 'pending' };
                    setTranslation(view.translation);
                    send({
                      type: 'translateStatement',
                      contestId: data.contestId,
                      index: data.index,
                      collection: data.collection,
                    });
                  }
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
              {!translationEnabled && (
                <span className="translation-hint" id="translation-disabled-hint">
                  {t('Enable AI statement translation in AI assistance to use this feature.')}{' '}
                  <button className="text-link" onClick={() => send({ type: 'openAiSettings' })}>
                    {t('Go to AI assistance settings')}
                  </button>
                </span>
              )}
            </span>
          </div>
        </header>
        <div className="statement-scroll" ref={viewport}>
          {data?.statement.imageWarning && (
            <p className="error">{t(data.statement.imageWarning)}</p>
          )}
          {translated && translation?.status !== 'ready' && (
            <p role="status">
              {translation?.status === 'failed'
                ? t(translation.error ?? '')
                : t('Translating, please wait…')}
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
                  {t('Retry')}
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
