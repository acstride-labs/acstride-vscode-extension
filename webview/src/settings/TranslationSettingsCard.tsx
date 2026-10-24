import React, { useEffect, useState, useRef } from 'react';
import {
  defaultTranslationOptions,
  defaultTranslationPrompt,
  type TranslationOptions,
  translationLanguages,
  type TranslationLanguage,
} from '../../../src/shared/ai-protocol';
import { useI18n } from '../i18n';
import { send } from '../bridge';
export function TranslationSettingsCard({ options }: { options?: TranslationOptions }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(defaultTranslationOptions);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmation = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirming) confirmation.current?.showModal();
    else confirmation.current?.close();
  }, [confirming]);
  useEffect(() => {
    if (options) {
      setDraft(options);
      setSaved(true);
    }
  }, [options?.enabled, options?.autoTranslate, options?.targetLanguage, options?.prompt]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data.type === 'translationSettingsSaved') setSaved(true);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  const change = (value: Partial<TranslationOptions>) => {
    setDraft({ ...draft, ...value });
    setSaved(false);
  };
  return (
    <section className="card settings-section">
      <h2>{t('AI statement translation')}</h2>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => change({ enabled: e.target.checked })}
        />
        {t('Enable AI statement translation')}
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          disabled={!draft.enabled}
          checked={draft.autoTranslate}
          onChange={(e) => change({ autoTranslate: e.target.checked })}
        />
        {t('Translate automatically on import')}
      </label>
      <p>
        {t(
          'Uses the AI settings above. Automatic translation starts after a statement downloads; otherwise, click its translation icon to start.',
        )}
      </p>
      <label>
        {t('Translation target language')}
        <select
          value={draft.targetLanguage}
          onChange={(e) => change({ targetLanguage: e.target.value as TranslationLanguage })}
        >
          {Object.entries(translationLanguages).map(([code, name]) => (
            <option key={code} value={code}>
              {t(name)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('Translation prompt')}
        <textarea
          rows={8}
          value={draft.prompt}
          maxLength={20000}
          onChange={(e) => change({ prompt: e.target.value })}
        />
      </label>
      <p>
        {t(
          'Use {{language}} in the prompt. Before sending, it is replaced with the English name of the selected target language; the saved prompt stays unchanged.',
        )}
      </p>
      <p>
        {t('Replacement value: {target}', { target: translationLanguages[draft.targetLanguage] })}
      </p>
      {!draft.prompt.includes('{{language}}') && (
        <p className="error" role="status">
          {t(
            'This prompt has no {{language}} placeholder, so the selected target language will not be inserted.',
          )}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          disabled={!draft.prompt.trim() || saved}
          onClick={() => send({ type: 'saveTranslationSettings', options: draft })}
        >
          {t('Save changes')}
        </button>
        <button type="button" className="secondary" onClick={() => setConfirming(true)}>
          {t('Restore default prompt')}
        </button>
        {saved && <span role="status">{t('Saved')}</span>}
      </div>
      <dialog
        ref={confirmation}
        className="prompt-confirmation"
        aria-labelledby="restore-prompt-title"
        onCancel={() => setConfirming(false)}
      >
        <h3 id="restore-prompt-title">{t('Restore default prompt?')}</h3>
        <p>{t('This replaces the current prompt draft. Save your changes to apply it.')}</p>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            autoFocus
            onClick={() => setConfirming(false)}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              change({ prompt: defaultTranslationPrompt });
              setConfirming(false);
            }}
          >
            {t('Confirm restore')}
          </button>
        </div>
      </dialog>
    </section>
  );
}
