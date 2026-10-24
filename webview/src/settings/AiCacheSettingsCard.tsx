import { Field, VscodeButton, VscodeCheckbox, VscodeTextfield, checkedOf, numberOf } from '../ui';
import React, { useEffect, useState } from 'react';
import {
  aiCacheOptionsSchema,
  defaultAiCacheOptions,
  type AiCacheOptions,
} from '../../../src/shared/ai-protocol';
import { send } from '../bridge';
import { useI18n } from '../i18n';
export function AiCacheSettingsCard({
  options,
  busy,
}: {
  options?: AiCacheOptions;
  busy: boolean;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(defaultAiCacheOptions);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (options) {
      setDraft(options);
      setSaved(true);
    }
  }, [options?.enabled, options?.maxEntries, options?.maxSizeMb]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data.type === 'aiCacheSettingsSaved') setSaved(true);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  const change = (value: Partial<AiCacheOptions>) => {
    setDraft({ ...draft, ...value });
    setSaved(false);
    setError('');
  };
  return (
    <section className="card settings-section">
      <h2>{t('AI cache settings')}</h2>
      <VscodeCheckbox
        checked={draft.enabled}
        onChange={(e) => change({ enabled: checkedOf(e) })}
        label={t('Enable AI request cache')}
      />
      <p>
        {t(
          'Stores AI request input and output locally. Identical requests reuse the result; API keys are not stored. Connection tests always bypass the cache.',
        )}
      </p>
      <Field>
        {t('Maximum cached requests')}
        <VscodeTextfield
          type="number"
          min={1}
          max={10000}
          step={1}
          value={String(Number.isNaN(draft.maxEntries) ? '' : draft.maxEntries)}
          onInput={(e) => change({ maxEntries: numberOf(e) })}
        />
      </Field>
      <Field>
        {t('Maximum cache size (MB)')}
        <VscodeTextfield
          type="number"
          min={1}
          max={1024}
          step={1}
          value={String(Number.isNaN(draft.maxSizeMb) ? '' : draft.maxSizeMb)}
          onInput={(e) => change({ maxSizeMb: numberOf(e) })}
        />
      </Field>
      <p>
        {t(
          'LRU removes the least recently used requests when either limit is reached. Oversized results are returned without being cached. Disabling the cache keeps existing entries but skips reads and writes.',
        )}
      </p>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="actions">
        <VscodeButton
          type="button"
          disabled={busy || saved}
          onClick={() => {
            const checked = aiCacheOptionsSchema.safeParse(draft);
            if (!checked.success) {
              setError('Use 1–10000 requests and 1–1024 MB.');
              return;
            }
            send({ type: 'saveAiCacheSettings', options: checked.data });
          }}
        >
          {t('Save changes')}
        </VscodeButton>
        {saved && <span role="status">{t('Saved')}</span>}
      </div>
    </section>
  );
}
