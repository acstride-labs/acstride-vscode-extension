import { languages } from '../../../src/domain/languages';
import React, { useEffect, useRef, useState } from 'react';
import type {
  AssistantHostMessage,
  AssistantKind,
  AssistantOptions,
  AssistantResult,
  AssistantTarget,
} from '../../../src/shared/ai-assistance';
import { send } from '../bridge';
import { useI18n } from '../i18n';
import { AiIcon } from './AiIcon';
const names = { hint: 'AI Hint', debug: 'AI Debug', coding: 'AI Coding' };
export function AssistantActions({
  kinds,
  target,
  disabled = false,
}: {
  kinds: AssistantKind[];
  target?: AssistantTarget;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [options, setOptions] = useState<AssistantOptions>();
  const [open, setOpen] = useState<AssistantKind>();
  const [status, setStatus] = useState<'pending' | 'ready' | 'failed'>('pending');
  const [result, setResult] = useState<AssistantResult>();
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const request = useRef('');
  const dialog = useRef<HTMLDialogElement>(null);
  const identity = target
    ? `${target.collection}/${target.contestId}/${target.index}/${target.language}`
    : '';
  useEffect(() => {
    const listener = (event: MessageEvent<AssistantHostMessage>) => {
      const message = event.data;
      if (message.type === 'assistantOptions') setOptions(message.options);
      if (message.type === 'assistantCopied' && message.requestId === request.current)
        setCopied(true);
      if (message.type === 'assistantResult' && message.requestId === request.current) {
        setStatus(message.status);
        setResult(message.result);
        setError(message.error ?? '');
      }
    };
    window.addEventListener('message', listener);
    send({ type: 'assistantReady' });
    return () => window.removeEventListener('message', listener);
  }, []);
  useEffect(() => {
    request.current = '';
    setOpen(undefined);
  }, [identity]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const start = (kind: AssistantKind) => {
    if (!target) return;
    const requestId = crypto.randomUUID();
    request.current = requestId;
    setOpen(kind);
    setStatus('pending');
    setResult(undefined);
    setError('');
    setRevealed([]);
    setCopied(false);
    send({ type: 'aiAssist', requestId, kind, target });
  };
  return (
    <>
      <span className="ai-actions">
        {kinds
          .filter((kind) => options?.[kind].show)
          .map((kind) => (
            <button
              key={kind}
              type="button"
              className="secondary ai-action-button"
              aria-label={names[kind]}
              title={names[kind]}
              disabled={disabled || !target}
              onClick={() => start(kind)}
            >
              <AiIcon kind={kind} /> <span>{names[kind]}</span>
            </button>
          ))}
      </span>
      <dialog
        className={`assistant-dialog ${open === 'coding' ? 'assistant-code-dialog' : ''}`}
        ref={dialog}
        aria-labelledby="assistant-dialog-title"
        onCancel={() => setOpen(undefined)}
      >
        <header className="assistant-dialog-header">
          <h2 id="assistant-dialog-title">
            {open ? names[open] : ''} {target ? `· #${target.contestId} ${target.index}` : ''}
          </h2>
          <button className="secondary" type="button" onClick={() => setOpen(undefined)}>
            {t('Close')}
          </button>
        </header>
        {status === 'pending' && <p role="status">{t('AI task is running, please wait.')}</p>}
        {status === 'failed' && (
          <>
            <p className="error" role="alert">
              {t(error)}
            </p>
            <button className="secondary" type="button" onClick={() => open && start(open)}>
              {t('Retry')}
            </button>
          </>
        )}
        {status === 'ready' && open === 'hint' && (
          <ol className="assistant-hints">
            {result?.hints?.map((hint, i) => (
              <li key={i}>
                <div className="assistant-hint-heading">
                  <strong>{t('Hint {number}', { number: i + 1 })}</strong>
                  <button
                    type="button"
                    className="secondary hint-eye"
                    aria-label={t(
                      revealed.includes(i) ? 'Hide hint {number}' : 'Reveal hint {number}',
                      { number: i + 1 },
                    )}
                    aria-expanded={revealed.includes(i)}
                    onClick={() =>
                      setRevealed((old) =>
                        old.includes(i) ? old.filter((n) => n !== i) : [...old, i],
                      )
                    }
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M1.5 10s3-5 8.5-5 8.5 5 8.5 5-3 5-8.5 5-8.5-5-8.5-5z" />
                      <circle cx="10" cy="10" r="2.5" />
                      {revealed.includes(i) && <path d="M3 17L17 3" />}
                    </svg>
                  </button>
                </div>
                {revealed.includes(i) ? (
                  <p className="assistant-prose">{hint}</p>
                ) : (
                  <p className="assistant-hidden">
                    {t('Hint hidden. Reveal it when you are ready.')}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
        {status === 'ready' && open === 'debug' && (
          <div className="assistant-prose">{result?.text}</div>
        )}
        {status === 'ready' && open === 'coding' && (
          <>
            <p className="assistant-note">
              {t('AI-generated reference code. Review and test it before use.')}
            </p>
            <div className="assistant-editor">
              <div className="assistant-editor-title">
                {target ? languages[target.language].sourceFile : ''} · {t('Reference code')}
              </div>
              <textarea
                aria-label={t('Reference code')}
                readOnly
                spellCheck={false}
                value={result?.text ?? ''}
              />
            </div>
            <div className="actions">
              <button
                type="button"
                onClick={() =>
                  send({ type: 'copyAiCode', requestId: request.current, text: result?.text ?? '' })
                }
              >
                {t(copied ? 'Copied' : 'Copy code')}
              </button>
              {error && (
                <span role="alert" className="error">
                  {t(error)}
                </span>
              )}
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
