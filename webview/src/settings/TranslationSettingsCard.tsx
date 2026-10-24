import {
  Field,
  VscodeButton,
  VscodeCheckbox,
  VscodeOption,
  VscodeSingleSelect,
  VscodeTextarea,
  checkedOf,
  valueOf,
} from '../ui';
import React, { useEffect, useState, useRef } from 'react';
import {
  defaultTranslationOptions,
  defaultTranslationPrompt,
  type TranslationOptions,
  translationOptionsSchema,
  translationLanguages,
  type TranslationLanguage,
} from '../../../src/shared/ai-protocol';
import { useI18n } from '../i18n';
import { send } from '../bridge';
export function TranslationSettingsCard({ options }: { options?: TranslationOptions }) {
  const { locale, t } = useI18n();
  const [draft, setDraft] = useState(defaultTranslationOptions);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmation = useRef<HTMLDialogElement>(null);
  const current = useRef(defaultTranslationOptions);
  const persisted = useRef('');
  const dirty = useRef(false);
  const inFlight = useRef<TranslationOptions>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const flush = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (inFlight.current) return;
    const parsed = translationOptionsSchema.safeParse(current.current);
    if (!parsed.success || JSON.stringify(parsed.data) === persisted.current) return;
    inFlight.current = parsed.data;
    send({ type: 'saveTranslationSettings', options: parsed.data });
  };
  useEffect(() => {
    if (confirming) confirmation.current?.showModal();
    else confirmation.current?.close();
  }, [confirming]);
  useEffect(() => {
    // Host refreshes must not overwrite edits made while a save is in flight.
    if (options && !dirty.current && !inFlight.current && !timer.current) {
      current.current = options;
      persisted.current = JSON.stringify(options);
      setDraft(options);
      setSaved(true);
    }
  }, [options?.enabled, options?.autoTranslate, options?.targetLanguage, options?.prompt]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data.type === 'translationSettingsSaved' && inFlight.current) {
        persisted.current = JSON.stringify(inFlight.current);
        inFlight.current = undefined;
        const parsed = translationOptionsSchema.safeParse(current.current);
        const matches = parsed.success && JSON.stringify(parsed.data) === persisted.current;
        dirty.current = !matches;
        setSaved(matches);
        if (!matches && !timer.current) flush();
      }
    };
    window.addEventListener('message', listener);
    return () => {
      window.removeEventListener('message', listener);
      clearTimeout(timer.current);
    };
  }, []);
  const change = (value: Partial<TranslationOptions>, delayed = false) => {
    current.current = { ...current.current, ...value };
    setDraft(current.current);
    dirty.current = true;
    setSaved(false);
    clearTimeout(timer.current);
    if (delayed) timer.current = setTimeout(flush, 500);
    else flush();
  };
  return (
    <section className="card settings-section">
      <h2>{t('AI statement translation')}</h2>
      <VscodeCheckbox
        checked={draft.enabled}
        onChange={(e) => change({ enabled: checkedOf(e) })}
        label={t('Enable AI statement translation')}
      />
      <VscodeCheckbox
        disabled={!draft.enabled}
        checked={draft.autoTranslate}
        onChange={(e) => change({ autoTranslate: checkedOf(e) })}
        label={t('Translate automatically on import')}
      />
      <p>
        {t(
          'Uses the AI settings above. Automatic translation starts after a statement downloads; otherwise, click its translation icon to start.',
        )}
      </p>
      <Field>
        {t('Translation target language')}
        <VscodeSingleSelect
          key={locale}
          value={draft.targetLanguage}
          onChange={(e) => change({ targetLanguage: valueOf(e) as TranslationLanguage })}
        >
          {Object.entries(translationLanguages).map(([code, name]) => (
            <VscodeOption key={code} value={code}>
              {t(name)}
            </VscodeOption>
          ))}
        </VscodeSingleSelect>
      </Field>
      <Field>
        {t('Translation prompt')}
        <VscodeTextarea
          rows={8}
          value={draft.prompt}
          maxLength={20000}
          onInput={(e) => change({ prompt: valueOf(e) }, true)}
          onBlur={flush}
        />
      </Field>
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
        <VscodeButton type="button" secondary onClick={() => setConfirming(true)}>
          {t('Restore default prompt')}
        </VscodeButton>
        <span role="status">{t(saved ? 'Saved' : 'Changes are saved automatically.')}</span>
        {!draft.prompt.trim() && (
          <span className="error">{t('Translation prompt cannot be empty.')}</span>
        )}
      </div>
      <dialog
        ref={confirmation}
        className="prompt-confirmation"
        aria-labelledby="restore-prompt-title"
        onCancel={() => setConfirming(false)}
      >
        <h3 id="restore-prompt-title">{t('Restore default prompt?')}</h3>
        <p>{t('This restores the default prompt and saves it immediately.')}</p>
        <div className="actions">
          <VscodeButton type="button" secondary autoFocus onClick={() => setConfirming(false)}>
            {t('Cancel')}
          </VscodeButton>
          <VscodeButton
            type="button"
            onClick={() => {
              change({ prompt: defaultTranslationPrompt });
              setConfirming(false);
            }}
          >
            {t('Confirm restore')}
          </VscodeButton>
        </div>
      </dialog>
    </section>
  );
}
