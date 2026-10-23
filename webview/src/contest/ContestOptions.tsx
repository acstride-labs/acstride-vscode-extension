import React, { useEffect, useState } from 'react';
import type { ContestRecord } from '../../../src/domain/contest';
import { send } from '../bridge';
import { useI18n } from '../i18n';

export function ContestOptions({
  record,
  disabled,
  onDirty,
}: {
  record: ContestRecord;
  disabled: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const initial = {
    autoDownload: record.autoDownload,
    defaultLanguage: record.defaultLanguage,
    archived: record.archived,
  };
  const [options, setOptions] = useState(initial);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty || JSON.stringify(options) === JSON.stringify(initial)) {
      setOptions(initial);
      setDirty(false);
    }
  }, [record.autoDownload, record.defaultLanguage, record.archived]);
  return (
    <fieldset className="card settings-section contest-options" disabled={disabled}>
      <label>
        {t('Default solution language')}
        <select
          value={options.defaultLanguage}
          onChange={(e) => {
            setDirty(true);
            setOptions({ ...options, defaultLanguage: e.target.value as 'cpp' | 'python' });
          }}
        >
          <option value="cpp">C++</option>
          <option value="python">Python 3</option>
        </select>
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={options.autoDownload}
          onChange={(e) => {
            setDirty(true);
            setOptions({ ...options, autoDownload: e.target.checked });
          }}
        />
        {t('Automatically download problems at start')}
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={options.archived}
          onChange={(e) => {
            setDirty(true);
            setOptions({ ...options, archived: e.target.checked });
          }}
        />
        {t('Archive this contest')}
      </label>
      <small>
        {t('Archiving pauses automatic background work and preserves all code and tests.')}
      </small>
      <div className="actions">
        <button
          disabled={!dirty}
          onClick={() =>
            send({ type: 'saveContestSettings', contestId: record.contest.id, values: options })
          }
        >
          {t('Save contest settings')}
        </button>
        <button
          disabled={!dirty}
          className="secondary"
          onClick={() => {
            setOptions(initial);
            setDirty(false);
          }}
        >
          {t('Discard changes')}
        </button>
        {dirty && <small>{t('Unsaved changes')}</small>}
      </div>
    </fieldset>
  );
}
