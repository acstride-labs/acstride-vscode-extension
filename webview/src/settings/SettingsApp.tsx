import React, { useEffect, useState } from 'react';
import { send } from '../bridge';
import { useI18n } from '../i18n';
import type { SettingsState, SettingsValues } from '../../../src/shared/settings-protocol';
import type { LocalePreference } from '../../../src/shared/i18n';

export function SettingsApp() {
  const { t } = useI18n();
  const [state, setState] = useState<SettingsState>();
  const [values, setValues] = useState<SettingsValues>();
  const [cppArgs, setCppArgs] = useState('[]'),
    [pythonArgs, setPythonArgs] = useState('[]');
  const [dirty, setDirty] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.data?.type !== 'settingsState') return;
      setState(event.data.state);
      if (event.data.state.notice === 'Settings saved.') setDirty(false);
    };
    window.addEventListener('message', receive);
    send({ type: 'ready' });
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    if (!state || dirty) return;
    setValues(state.values);
    setCppArgs(JSON.stringify(state.values.cppArgs));
    setPythonArgs(JSON.stringify(state.values.pythonArgs));
  }, [state, dirty]);
  const reset = () => {
    setDirty(false);
    setError('');
  };
  const update = (field: keyof SettingsValues, value: string | number) => {
    setValues((old) => (old ? { ...old, [field]: value } : old));
    setDirty(true);
    setError('');
  };
  const disabled = !state || state.busy;
  return (
    <main className="settings-page">
      <header className="center-header">
        <div>
          <h1>{t('Settings')}</h1>
        </div>
      </header>
      <section className="card settings-section">
        <h2>{t('Interface language')}</h2>
        <label>
          {t('Display language')}
          <select
            disabled={disabled}
            value={state?.preference ?? 'auto'}
            onChange={(e) =>
              send({ type: 'setLocale', locale: e.target.value as LocalePreference })
            }
          >
            <option value="auto">{t('Follow VS Code')}</option>
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
            <option value="ru">Русский</option>
            <option value="ja">日本語</option>
          </select>
        </label>
        <p>
          {t(
            'Applies immediately to CFIDE pages. Problem statements and your code are not translated.',
          )}
        </p>
      </section>
      {state?.error && (
        <p className="error" role="alert">
          {t(state.error)}
        </p>
      )}
      {state?.notice && !dirty && <p role="status">{t(state.notice)}</p>}
      <section className="card settings-section">
        <h2>{t('Settings scope')}</h2>
        <label>
          {t('Save to')}
          <select
            disabled={disabled || dirty}
            value={state?.scope ?? 'user'}
            onChange={(e) => {
              reset();
              send({ type: 'settingsScope', scope: e.target.value as 'user' | 'workspace' });
            }}
          >
            <option value="user">{t('User settings')}</option>
            <option value="workspace" disabled={!state?.workspaceAvailable}>
              {t('This workspace')}
            </option>
          </select>
        </label>
        <p>
          {t(
            'Workspace settings override user settings. Interface language is always a user preference.',
          )}
        </p>
        {dirty && <small>{t('Save or discard changes before changing scope.')}</small>}
      </section>
      {values && state && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const c: unknown = JSON.parse(cppArgs),
                p: unknown = JSON.parse(pythonArgs);
              if (![c, p].every((a) => Array.isArray(a) && a.every((v) => typeof v === 'string')))
                throw new Error();
              setError('');
              send({
                type: 'saveSettings',
                scope: state.scope,
                values: { ...values, cppArgs: c as string[], pythonArgs: p as string[] },
              });
            } catch {
              setError('Arguments must be JSON arrays of strings.');
            }
          }}
        >
          <fieldset disabled={disabled || !state.trusted}>
            <section className="card settings-section">
              <h2>{t('Public tracking')}</h2>
              <label>
                {t('Codeforces handle')}
                <input
                  value={values.handle}
                  maxLength={64}
                  pattern="[A-Za-z0-9_.-]{1,64}"
                  onChange={(e) => update('handle', e.target.value)}
                />
              </label>
              <p>{t('Read-only public tracking, not login. Leave blank to stop tracking.')}</p>
            </section>
            <section className="card settings-section">
              <h2>C++</h2>
              <label>
                {t('Compiler')}
                <input
                  required
                  value={values.compiler}
                  onChange={(e) => update('compiler', e.target.value)}
                />
              </label>
              <label>
                {t('Compiler arguments (JSON array)')}
                <input
                  value={cppArgs}
                  onChange={(e) => {
                    setCppArgs(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <label>
                {t('C++ template path')}
                <input
                  value={values.cppTemplate}
                  onChange={(e) => update('cppTemplate', e.target.value)}
                />
              </label>
            </section>
            <section className="card settings-section">
              <h2>Python</h2>
              <label>
                {t('Solution interpreter')}
                <input
                  required
                  value={values.interpreter}
                  onChange={(e) => update('interpreter', e.target.value)}
                />
              </label>
              <label>
                {t('Interpreter arguments (JSON array)')}
                <input
                  value={pythonArgs}
                  onChange={(e) => {
                    setPythonArgs(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <label>
                {t('Python template path')}
                <input
                  value={values.pythonTemplate}
                  onChange={(e) => update('pythonTemplate', e.target.value)}
                />
              </label>
              <p>
                {t(
                  'The solution interpreter is separate from the built-in downloader. Blank template paths use bundled defaults.',
                )}
              </p>
            </section>
            <section className="card settings-section">
              <h2>{t('Local execution')}</h2>
              <label>
                {t('Time limit per test (ms)')}
                <input
                  type="number"
                  required
                  min={100}
                  max={60000}
                  step={1}
                  value={values.timeoutMs}
                  onChange={(e) => update('timeoutMs', Number(e.target.value))}
                />
              </label>
              <p>
                {t(
                  'Arguments are passed without a shell. Save settings before checking the active environment.',
                )}
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={dirty}
                  onClick={() => send({ type: 'checkEnvironment', language: 'cpp' })}
                >
                  {t('Check C++ environment')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={dirty}
                  onClick={() => send({ type: 'checkEnvironment', language: 'python' })}
                >
                  {t('Check Python environment')}
                </button>
              </div>
            </section>
            <div className="actions">
              <button type="submit" disabled={!dirty}>
                {t('Save settings')}
              </button>
              <button type="button" className="secondary" disabled={!dirty} onClick={reset}>
                {t('Discard changes')}
              </button>
              {dirty && <small>{t('Unsaved changes')}</small>}
            </div>
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {t(error)}
            </p>
          )}
          {!state.trusted && (
            <p className="error">{t('Trust this workspace before changing execution settings.')}</p>
          )}
        </form>
      )}
    </main>
  );
}
