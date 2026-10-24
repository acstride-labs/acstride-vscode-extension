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
const names = { hint: 'AI Hint', debug: 'AI Debug', coding: 'AI Solution' };
export function AssistanceSettingsCard({ options }: { options?: AssistantOptions }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(defaultAssistantOptions);
  const [dirty, setDirty] = useState<Partial<Record<AssistantKind, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Partial<Record<AssistantKind, string>>>({});
  const activeSave = useRef<AssistantKind>();
  const [restore, setRestore] = useState<AssistantKind>();
  const confirmation = useRef<HTMLDialogElement>(null);
  const submitted = useRef<string>();
  const baseline = useRef(defaultAssistantOptions());
  useEffect(() => {
    if (!options || Object.values(dirty).some(Boolean) || saving) return;
    if (submitted.current && JSON.stringify(options) !== submitted.current) return;
    submitted.current = undefined;
    baseline.current = options;
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
        if (activeSave.current) {
          const kind = activeSave.current;
          setDirty((old) => ({ ...old, [kind]: false }));
          setError((old) => ({ ...old, [kind]: '' }));
        }
      }
      if (event.data.type === 'assistanceSettingsFailed') {
        setSaving(false);
        submitted.current = undefined;
        if (activeSave.current) {
          const kind = activeSave.current;
          setError((old) => ({ ...old, [kind]: event.data.error }));
        }
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  const change = (kind: AssistantKind, patch: Partial<AssistantOptions[AssistantKind]>) => {
    setDraft((old) => ({ ...old, [kind]: { ...old[kind], ...patch } }));
    setDirty((old) => ({ ...old, [kind]: true }));
  };
  return (
    <>
      {assistantKinds.map((kind) => (
        <section className="card settings-section" key={kind}>
          <h2 className="ai-settings-heading">
            <AiIcon kind={kind} />
            {t(names[kind])}
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
                hint: 'Generate progressive hints from the problem statement. Each hint is hidden until you reveal it.',
                debug:
                  'Send the problem statement and your current code, including unsaved edits. AI identifies issues without providing corrected code.',
                coding:
                  'Generate reference code from the problem statement in the selected solution language. Preview and copy only; your source is never replaced.',
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
              kind === 'hint'
                ? 'Placeholders: {{language}} is the selected response language; {{hintCount}} is the number of hints. They are replaced before the request, while the saved prompt stays unchanged.'
                : 'Placeholders: {{language}} is the selected response language; {{programmingLanguage}} is the current solution language; {{hintCount}} is the number of hints. They are replaced before the request, while the saved prompt stays unchanged.',
            )}
          </p>
          <div className="actions">
            <button
              type="button"
              disabled={
                !dirty[kind] ||
                saving ||
                !draft[kind].prompt.trim() ||
                (kind === 'hint' &&
                  (!Number.isInteger(draft.hint.hintCount) ||
                    draft.hint.hintCount < 1 ||
                    draft.hint.hintCount > 10))
              }
              onClick={() => {
                const value = assistantOptionsSchema.parse({
                  ...baseline.current,
                  [kind]: draft[kind],
                });
                baseline.current = value;
                submitted.current = JSON.stringify(value);
                activeSave.current = kind;

                setSaving(true);
                setError((old) => ({ ...old, [kind]: '' }));
                send({ type: 'saveAssistanceSettings', kind, options: value });
              }}
            >
              {t('Save')}
            </button>
            <span role="status">
              {t(
                saving && activeSave.current === kind
                  ? 'Saving…'
                  : dirty[kind]
                    ? 'Unsaved changes'
                    : 'Saved',
              )}
            </span>

            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() => setRestore(kind)}
            >
              {t('Restore default prompt')}
            </button>
          </div>
          {error[kind] && (
            <p role="alert" className="error">
              {t(error[kind]!)}
            </p>
          )}
        </section>
      ))}
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
