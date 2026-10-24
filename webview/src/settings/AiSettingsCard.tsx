import React, { useEffect, useState } from 'react';
import { aiConfigSchema, aiKeySchema, type AiState } from '../../../src/shared/ai-protocol';
import { send } from '../bridge';
import { useI18n } from '../i18n';
export function AiSettingsCard({ state, busy }: { state?: AiState; busy: boolean }) {
  const { t } = useI18n();
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (state && !dirty) {
      setBaseUrl(state.config.baseUrl);
      setModel(state.config.model);
    }
  }, [state?.config.baseUrl, state?.config.model, dirty]);
  useEffect(() => {
    if (state?.notice === 'AI settings saved.') {
      setApiKey('');
      setDirty(false);
    }
  }, [state?.notice]);
  const act = (type: 'saveAI' | 'testAI') => {
    if (!baseUrl.trim() || !model.trim()) {
      setError('Enter an AI Base URL and model name.');
      return;
    }
    if (!aiConfigSchema.safeParse({ baseUrl, model }).success) {
      setError('Use an HTTPS AI Base URL, or HTTP for a local service.');
      return;
    }
    if (!aiKeySchema.safeParse(apiKey).success) {
      setError('API key must be a single line.');
      return;
    }
    setError('');
    send({ type, config: { baseUrl, model }, apiKey: apiKey || undefined });
  };
  const storedKey =
    state?.hasKey && baseUrl.replace(/\/+$/, '') === state.config.baseUrl.replace(/\/+$/, '');
  return (
    <section className="card settings-section ai-settings">
      <h2>{t('AI settings')}</h2>
      <p>
        {t(
          'Supports OpenAI-compatible Chat Completions APIs. Testing sends only a short fixed message, without your code or problem statements.',
        )}
      </p>
      <label>
        Base URL
        <input
          type="url"
          value={baseUrl}
          placeholder="https://api.example.com/v1"
          maxLength={2048}
          disabled={busy}
          onChange={(e) => {
            setBaseUrl(e.target.value);
            setDirty(true);
            setError('');
          }}
        />
      </label>
      <label>
        {t('Model name')}
        <input
          value={model}
          placeholder="model-name"
          maxLength={200}
          disabled={busy}
          onChange={(e) => {
            setModel(e.target.value);
            setDirty(true);
            setError('');
          }}
        />
      </label>
      <label>
        API Key
        <input
          type="password"
          autoComplete="new-password"
          value={apiKey}
          placeholder={t(
            storedKey
              ? 'Key saved; leave blank to keep it'
              : 'API key (optional for local services)',
          )}
          maxLength={8192}
          disabled={busy}
          onChange={(e) => {
            setApiKey(e.target.value);
            setDirty(true);
          }}
        />
      </label>
      <small>
        {t(
          'API keys are stored in VS Code secure storage for this endpoint. AI settings apply to this VS Code profile, independently of workspace scope.',
        )}
      </small>
      <div className="actions">
        <button
          type="button"
          disabled={busy || (!dirty && !!state?.config.baseUrl)}
          onClick={() => act('saveAI')}
        >
          {t('Save AI settings')}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => act('testAI')}>
          {t(state?.result?.status === 'checking' ? 'Checking…' : 'Test connection')}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || !storedKey}
          onClick={() => {
            setApiKey('');
            send({ type: 'forgetAIKey' });
          }}
        >
          {t('Remove API key')}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      {state?.notice && <p role="status">{t(state.notice)}</p>}
      {state?.result && (
        <div
          className={state.result.status === 'failed' ? 'error ai-test-result' : 'ai-test-result'}
          role={state.result.status === 'failed' ? 'alert' : 'status'}
        >
          <strong>
            {t(
              state.result.status === 'checking'
                ? 'Checking…'
                : state.result.status === 'passed'
                  ? 'AI connection succeeded'
                  : 'AI connection failed',
            )}
          </strong>
          {state.result.message && (
            <pre>
              {state.result.status === 'passed' ? state.result.message : t(state.result.message)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
