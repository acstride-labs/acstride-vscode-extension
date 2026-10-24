import React, { useEffect, useState } from 'react';
import { send } from '../bridge';
import { useI18n } from '../i18n';
import type { SettingsState, SettingsValues } from '../../../src/shared/settings-protocol';
import type { LocalePreference } from '../../../src/shared/i18n';
import type { Language } from '../../../src/domain/models';

export function SettingsApp() {
  const { t } = useI18n();
  const [state, setState] = useState<SettingsState>();
  const [values, setValues] = useState<SettingsValues>();
  const [templateLanguage, setTemplateLanguage] = useState<Language>('cpp');
  const [templateDrafts, setTemplateDrafts] = useState({ cpp: '', python: '' });
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
    setTemplateDrafts(state.templatePreviews);
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
      <section className="card settings-section" id="codeforces-account">
        <h2>{t('Codeforces account')}</h2>
        <p role="status">
          {!state || state.account.status === 'checking'
            ? t('Checking Codeforces login…')
            : state.account.status === 'signedIn'
              ? t('Signed in as {handle}', { handle: state.account.handle ?? '' })
              : t('Not signed in')}
        </p>
        {state?.account.error && (
          <p className="error" role="alert">
            {t(state.account.error)}
          </p>
        )}
        <div className="actions">
          {state?.account.status === 'signedIn' ? (
            <button
              className="secondary"
              disabled={disabled}
              onClick={() => send({ type: 'signOut' })}
            >
              {t('Sign out of Codeforces')}
            </button>
          ) : (
            <button
              disabled={disabled || state?.account.status === 'checking'}
              onClick={() => send({ type: 'signIn' })}
            >
              {t('Sign in to Codeforces')}
            </button>
          )}
          <button
            className="secondary"
            disabled={disabled || state?.account.status === 'checking'}
            onClick={() => send({ type: 'refreshAccount' })}
          >
            {t('Refresh login status')}
          </button>
        </div>
        <small>
          {t(
            'Sign in to enable one-click submission. Website verification may prevent login; you can still copy code and submit on Codeforces.',
          )}
        </small>
      </section>
      <section className="card settings-section environment-section">
        <div className="card-title">
          <h2>{t('Programming environments')}</h2>
          <button
            disabled={disabled || dirty || !state?.trusted}
            onClick={() => send({ type: 'checkAllEnvironments' })}
          >
            {t('Auto-check')}
          </button>
        </div>
        {(['cpp', 'python'] as const).map((language) => {
          const result = state?.environments[language];
          return (
            <div className="environment-item" key={language}>
              <div className="environment-row">
                <strong>{language === 'cpp' ? 'C++' : 'Python 3'}</strong>
                <code>{result?.command}</code>
                <span
                  className={
                    result?.status === 'passed'
                      ? 'pass'
                      : result?.status === 'failed'
                        ? 'error'
                        : ''
                  }
                  role="status"
                >
                  {result?.status === 'passed' ? '✓ ' : result?.status === 'failed' ? '✕ ' : ''}
                  {t(
                    result?.status === 'passed'
                      ? 'Available'
                      : result?.status === 'failed'
                        ? 'Unavailable'
                        : result?.status === 'checking'
                          ? 'Checking…'
                          : 'Not checked',
                  )}
                </span>
                <button
                  className="secondary"
                  disabled={disabled || dirty || !state?.trusted}
                  onClick={() => send({ type: 'checkEnvironment', language })}
                >
                  {t('Check')}
                </button>
              </div>
              {result?.message && (
                <details>
                  <summary>{t('Failure details')}</summary>
                  <pre className="error">{t(result.message)}</pre>
                </details>
              )}
            </div>
          );
        })}
        {dirty && <small>{t('Save changes before checking environments.')}</small>}
      </section>
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
            'Applies immediately to AC-Stride pages. Problem statements and your code are not translated.',
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
              <h2>{t('Code templates')}</h2>
              <div className="template-editor">
                <div className="template-controls">
                  <label>
                    {t('Template language')}
                    <select
                      value={templateLanguage}
                      onChange={(e) => setTemplateLanguage(e.target.value as Language)}
                    >
                      <option value="cpp">C++</option>
                      <option value="python">Python 3</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const code = state.defaultTemplates[templateLanguage];
                      setTemplateDrafts((old) => ({ ...old, [templateLanguage]: code }));
                      update(
                        templateLanguage === 'cpp' ? 'cppTemplateCode' : 'pythonTemplateCode',
                        code,
                      );
                    }}
                  >
                    {t('Restore default template')}
                  </button>
                  <button type="submit" disabled={!dirty}>
                    {t('Save settings')}
                  </button>
                </div>
                <label>
                  {t('Initial code')}
                  <textarea
                    className="template-code"
                    spellCheck={false}
                    value={templateDrafts[templateLanguage]}
                    maxLength={1_000_000}
                    onChange={(e) => {
                      const code = e.target.value;
                      setTemplateDrafts((old) => ({ ...old, [templateLanguage]: code }));
                      update(
                        templateLanguage === 'cpp' ? 'cppTemplateCode' : 'pythonTemplateCode',
                        code,
                      );
                    }}
                  />
                </label>
              </div>
              <small>
                {t(
                  'Used only for new solution files. Existing code stays unchanged. Use ${PROBLEM_ID} for the problem index.',
                )}
              </small>
              {state.templateWarnings[templateLanguage] && (
                <small className="error">
                  {t('Cannot read the template file. Paste code here to replace it.')}
                </small>
              )}
            </section>
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
