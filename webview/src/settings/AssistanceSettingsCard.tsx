import React, { useEffect, useRef, useState } from 'react';
import {
  assistantKinds,
  assistantOptionsSchema,
  defaultAssistantOptions,
  defaultAssistantPrompts,
  type AssistantKind,
  type AssistantOptions,
} from '../../../src/shared/ai-assistance';
import { translationLanguages, type TranslationLanguage } from '../../../src/shared/ai-protocol';
import { AiIcon } from '../ai/AiIcon';
import { send } from '../bridge';
import { useI18n } from '../i18n';
const names = { hint: 'AI Hint', debug: 'AI Debug', coding: 'AI Coding' };
export function AssistanceSettingsCard({ options }: { options?: AssistantOptions }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(defaultAssistantOptions);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [restore, setRestore] = useState<AssistantKind>();
  const confirmation = useRef<HTMLDialogElement>(null);
  const submitted = useRef<string>();
  useEffect(() => {
    if (!options || dirty || saving) return;
    if (submitted.current && JSON.stringify(options) !== submitted.current) return;
    submitted.current = undefined;
    setDraft(options);
  }, [options, dirty, saving]);
  useEffect(() => {
    if (restore) confirmation.current?.showModal();
    else confirmation.current?.close();
  }, [restore]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data.type === 'assistanceSettingsSaved') {
        setSaving(false);
        setDirty(false);
        setError('');
      }
      if (event.data.type === 'assistanceSettingsFailed') {
        setSaving(false);
        submitted.current = undefined;
        setError(event.data.error);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  const change = (kind: AssistantKind, patch: Partial<AssistantOptions[AssistantKind]>) => {
    setDraft((old) => ({ ...old, [kind]: { ...old[kind], ...patch } }));
    setDirty(true);
  };
  return (
    <>
      {assistantKinds.map((kind) => (
        <section className="card settings-section" key={kind}>
          <h2 className="ai-settings-heading">
            <AiIcon kind={kind} />
            {names[kind]}
          </h2>
          <label className="checkbox-label">
            <input
              type="checkbox"
              disabled={saving}
              checked={draft[kind].show}
              onChange={(e) => change(kind, { show: e.target.checked })}
            />
            {t('Show this feature')}
          </label>
          <p className="ai-competition-notice">
            {t('Do not use this feature during an ongoing contest.')}
          </p>
          <p>
            {t(
              {
                hint: 'Generate progressive hints from the original English statement. Each hint is hidden until you reveal it.',
                debug:
                  'Send the original English statement and your current code, including unsaved edits. AI identifies issues without providing corrected code.',
                coding:
                  'Generate reference code from the original English statement in the selected solution language. Preview and copy only; your source is never replaced.',
              }[kind],
            )}
          </p>
          <label>
            {t('Response language')}
            <select
              disabled={saving}
              value={draft[kind].targetLanguage}
              onChange={(e) =>
                change(kind, { targetLanguage: e.target.value as TranslationLanguage })
              }
            >
              {Object.entries(translationLanguages).map(([code, name]) => (
                <option value={code} key={code}>
                  {t(name)}
                </option>
              ))}
            </select>
          </label>
          {kind === 'hint' && (
            <label>
              {t('Number of hints')}
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                disabled={saving}
                value={draft.hint.hintCount}
                onChange={(e) => change(kind, { hintCount: Number(e.target.value) })}
              />
            </label>
          )}
          <label>
            {t('Prompt')}
            <textarea
              rows={7}
              maxLength={20000}
              disabled={saving}
              value={draft[kind].prompt}
              onChange={(e) => change(kind, { prompt: e.target.value })}
            />
          </label>
          <p>
            {t(
              'Placeholders: {{language}} is the selected response language; {{programmingLanguage}} is the current solution language; {{hintCount}} is the number of hints. They are replaced before the request, while the saved prompt stays unchanged.',
            )}
          </p>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() => setRestore(kind)}
            >
              {t('Restore default prompt')}
            </button>
          </div>
        </section>
      ))}
      <div className="actions">
        <button
          type="button"
          disabled={
            !dirty ||
            saving ||
            assistantKinds.some((k) => !draft[k].prompt.trim()) ||
            !Number.isInteger(draft.hint.hintCount) ||
            draft.hint.hintCount < 1 ||
            draft.hint.hintCount > 10
          }
          onClick={() => {
            const options = assistantOptionsSchema.parse(draft);
            submitted.current = JSON.stringify(options);
            setDraft(options);
            setSaving(true);
            setError('');
            send({ type: 'saveAssistanceSettings', options });
          }}
        >
          {t('Save AI assistance settings')}
        </button>
        <span role="status">{t(saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved')}</span>
      </div>
      {error && (
        <p role="alert" className="error">
          {t(error)}
        </p>
      )}
      <dialog
        ref={confirmation}
        className="prompt-confirmation"
        aria-labelledby="assistant-restore-title"
        onCancel={() => setRestore(undefined)}
      >
        <h3 id="assistant-restore-title">{t('Restore default prompt?')}</h3>
        <p>{t('This replaces the current prompt draft. Save your changes to apply it.')}</p>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            autoFocus
            onClick={() => setRestore(undefined)}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (restore) change(restore, { prompt: defaultAssistantPrompts[restore] });
              setRestore(undefined);
            }}
          >
            {t('Confirm restore')}
          </button>
        </div>
      </dialog>
    </>
  );
}
