import { Tabs } from '../ui/Tabs';
import {
  Field,
  VscodeButton,
  VscodeOption,
  VscodeSingleSelect,
  VscodeTextarea,
  VscodeTextfield,
  valueOf,
} from '../ui';
import React, { useEffect, useState } from 'react';
import { send } from '../bridge';
import { useI18n } from '../i18n';
import type { SettingsState, SettingsValues } from '../../../src/shared/settings-protocol';
import type { LocalePreference } from '../../../src/shared/i18n';
import { AiCacheSettingsCard } from './AiCacheSettingsCard';
import { TranslationSettingsCard } from './TranslationSettingsCard';
import { AiSettingsCard } from './AiSettingsCard';
import type { Language } from '../../../src/domain/models';
export function SettingsApp() {
  const { locale, t } = useI18n();
  const [tab, setTab] = useState<'environment' | 'basic' | 'coding' | 'assistance'>('environment');
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
      if (
        event.data?.type === 'settingsTab' &&
        ['environment', 'basic', 'coding', 'assistance'].includes(event.data.tab)
      ) {
        setTab(event.data.tab);
        return;
      }
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
        <h1>{t('Settings')}</h1>
      </header>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!state || !values) return;
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
        {state?.error && (
          <p className="error" role="alert">
            {t(state.error)}
          </p>
        )}
        {state?.notice && !dirty && <p role="status">{t(state.notice)}</p>}
        <Tabs
          value={tab}
          onChange={setTab}
          label={t('Settings sections')}
          className="settings-tabs"
          items={[
            {
              value: 'environment',
              label: t('Environment checks'),
              content: (
                <>
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
                        <VscodeButton
                          type="button"
                          secondary
                          disabled={disabled}
                          onClick={() => send({ type: 'signOut' })}
                        >
                          {t('Sign out of Codeforces')}
                        </VscodeButton>
                      ) : (
                        <VscodeButton
                          type="button"
                          disabled={disabled || state?.account.status === 'checking'}
                          onClick={() => send({ type: 'signIn' })}
                        >
                          {t('Sign in to Codeforces')}
                        </VscodeButton>
                      )}
                      <VscodeButton
                        type="button"
                        secondary
                        disabled={disabled || state?.account.status === 'checking'}
                        onClick={() => send({ type: 'refreshAccount' })}
                      >
                        {t('Refresh login status')}
                      </VscodeButton>
                    </div>
                    <small>
                      {t(
                        'Sign in to enable one-click submission. Website verification may prevent login; you can still copy code and submit on Codeforces.',
                      )}
                    </small>
                  </section>

                  {values && state && (
                    <>
                      <section className="card settings-section">
                        <h2>{t('Public tracking')}</h2>
                        <Field>
                          {t('Codeforces handle')}
                          <VscodeTextfield
                            value={String(
                              state?.account.status === 'signedIn'
                                ? state.account.handle
                                : values.handle,
                            )}
                            disabled={state?.account.status === 'signedIn'}
                            maxLength={64}
                            pattern="[A-Za-z0-9_.-]{1,64}"
                            onInput={(e) => update('handle', valueOf(e))}
                          />
                        </Field>
                        <p>
                          {state?.account.status === 'signedIn'
                            ? t('Tracking the signed-in account. Sign out to edit the handle.')
                            : t(
                                'Read-only public tracking, not login. Leave blank to stop tracking.',
                              )}
                        </p>
                      </section>
                    </>
                  )}
                  <section className="card settings-section environment-section">
                    <div className="card-title">
                      <h2>{t('Programming environments')}</h2>
                      <VscodeButton
                        type="button"
                        disabled={disabled || dirty || !state?.trusted}
                        onClick={() => send({ type: 'checkAllEnvironments' })}
                      >
                        {t('Auto-check')}
                      </VscodeButton>
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
                              {result?.status === 'passed'
                                ? '✓ '
                                : result?.status === 'failed'
                                  ? '✕ '
                                  : ''}
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
                            <VscodeButton
                              type="button"
                              secondary
                              disabled={disabled || dirty || !state?.trusted}
                              onClick={() => send({ type: 'checkEnvironment', language })}
                            >
                              {t('Check')}
                            </VscodeButton>
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
                </>
              ),
            },
            {
              value: 'basic',
              label: t('Basic settings'),
              content: (
                <>
                  <section className="card settings-section">
                    <h2>{t('Interface language')}</h2>
                    <Field>
                      {t('Display language')}
                      <VscodeSingleSelect
                        key={locale}
                        disabled={disabled}
                        value={state?.preference ?? 'auto'}
                        onChange={(e) =>
                          send({ type: 'setLocale', locale: valueOf(e) as LocalePreference })
                        }
                      >
                        <VscodeOption value="auto">{t('Follow VS Code')}</VscodeOption>
                        <VscodeOption value="en">English</VscodeOption>
                        <VscodeOption value="zh-CN">简体中文</VscodeOption>
                        <VscodeOption value="ru">Русский</VscodeOption>
                        <VscodeOption value="ja">日本語</VscodeOption>
                      </VscodeSingleSelect>
                    </Field>
                    <p>
                      {t(
                        'Applies immediately to AC-Stride pages. Problem statements and your code are not translated.',
                      )}
                    </p>
                  </section>
                  <section className="card settings-section">
                    <h2>{t('Settings scope')}</h2>
                    <Field>
                      {t('Save to')}
                      <VscodeSingleSelect
                        key={locale}
                        disabled={disabled || dirty}
                        value={state?.scope ?? 'user'}
                        onChange={(e) => {
                          reset();
                          send({
                            type: 'settingsScope',
                            scope: valueOf(e) as 'user' | 'workspace',
                          });
                        }}
                      >
                        <VscodeOption value="user">{t('User settings')}</VscodeOption>
                        <VscodeOption value="workspace" disabled={!state?.workspaceAvailable}>
                          {t('This workspace')}
                        </VscodeOption>
                      </VscodeSingleSelect>
                    </Field>
                    <p>
                      {t(
                        'Workspace settings override user settings. Interface language is always a user preference.',
                      )}
                    </p>
                    {dirty && <small>{t('Save or discard changes before changing scope.')}</small>}
                  </section>
                </>
              ),
            },
            {
              value: 'coding',
              label: t('Coding settings'),
              content: (
                <>
                  {values && state && (
                    <fieldset disabled={disabled || !state.trusted}>
                      <section className="card settings-section">
                        <h2>{t('Code templates')}</h2>
                        <Field>
                          {t('Default programming language')}
                          <VscodeSingleSelect
                            key={locale}
                            value={values.defaultLanguage}
                            onChange={(e) => update('defaultLanguage', valueOf(e))}
                            disabled={disabled || !state.trusted}
                          >
                            <VscodeOption value="cpp">C++</VscodeOption>
                            <VscodeOption value="python">Python 3</VscodeOption>
                          </VscodeSingleSelect>
                        </Field>
                        <small>
                          {t(
                            'Used for new contests and problems. Existing solutions keep their selected language.',
                          )}
                        </small>
                        <div className="template-editor">
                          <div className="template-controls">
                            <Field>
                              {t('Template language')}
                              <VscodeSingleSelect
                                key={locale}
                                value={templateLanguage}
                                onChange={(e) => setTemplateLanguage(valueOf(e) as Language)}
                                disabled={disabled || !state.trusted}
                              >
                                <VscodeOption value="cpp">C++</VscodeOption>
                                <VscodeOption value="python">Python 3</VscodeOption>
                              </VscodeSingleSelect>
                            </Field>
                            <VscodeButton
                              type="button"
                              secondary
                              onClick={() => {
                                const code = state.defaultTemplates[templateLanguage];
                                setTemplateDrafts((old) => ({ ...old, [templateLanguage]: code }));
                                update(
                                  templateLanguage === 'cpp'
                                    ? 'cppTemplateCode'
                                    : 'pythonTemplateCode',
                                  code,
                                );
                              }}
                              disabled={disabled || !state.trusted}
                            >
                              {t('Restore default template')}
                            </VscodeButton>
                            <VscodeButton
                              type="submit"
                              disabled={disabled || !state.trusted || !dirty}
                            >
                              {t('Save settings')}
                            </VscodeButton>
                          </div>
                          <Field>
                            {t('Initial code')}
                            <VscodeTextarea
                              className="template-code"
                              monospace
                              spellCheck={false}
                              value={templateDrafts[templateLanguage]}
                              maxLength={1000000}
                              onInput={(e) => {
                                const code = valueOf(e);
                                setTemplateDrafts((old) => ({ ...old, [templateLanguage]: code }));
                                update(
                                  templateLanguage === 'cpp'
                                    ? 'cppTemplateCode'
                                    : 'pythonTemplateCode',
                                  code,
                                );
                              }}
                              disabled={disabled || !state.trusted}
                            />
                          </Field>
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
                        <h2>C++</h2>
                        <Field>
                          {t('Compiler')}
                          <VscodeTextfield
                            required
                            value={String(values.compiler)}
                            onInput={(e) => update('compiler', valueOf(e))}
                            disabled={disabled || !state.trusted}
                          />
                        </Field>
                        <Field>
                          {t('Compiler arguments (JSON array)')}
                          <VscodeTextfield
                            value={String(cppArgs)}
                            onInput={(e) => {
                              setCppArgs(valueOf(e));
                              setDirty(true);
                            }}
                            disabled={disabled || !state.trusted}
                          />
                        </Field>
                      </section>
                      <section className="card settings-section">
                        <h2>Python</h2>
                        <Field>
                          {t('Solution interpreter')}
                          <VscodeTextfield
                            required
                            value={String(values.interpreter)}
                            onInput={(e) => update('interpreter', valueOf(e))}
                            disabled={disabled || !state.trusted}
                          />
                        </Field>
                        <Field>
                          {t('Interpreter arguments (JSON array)')}
                          <VscodeTextfield
                            value={String(pythonArgs)}
                            onInput={(e) => {
                              setPythonArgs(valueOf(e));
                              setDirty(true);
                            }}
                            disabled={disabled || !state.trusted}
                          />
                        </Field>
                        <p>
                          {t(
                            'The solution interpreter is separate from the built-in downloader. Blank template paths use bundled defaults.',
                          )}
                        </p>
                      </section>
                      <section className="card settings-section">
                        <h2>{t('Local execution')}</h2>
                        <Field>
                          {t('Time limit per test (ms)')}
                          <VscodeTextfield
                            type="number"
                            required
                            min={100}
                            max={60000}
                            step={1}
                            value={String(values.timeoutMs)}
                            onInput={(e) => update('timeoutMs', Number(valueOf(e)))}
                            disabled={disabled || !state.trusted}
                          />
                        </Field>
                        <p>
                          {t(
                            'Arguments are passed without a shell. Save settings before checking the active environment.',
                          )}
                        </p>
                      </section>
                    </fieldset>
                  )}
                </>
              ),
            },
            {
              value: 'assistance',
              label: t('AI assistance'),
              content: (
                <>
                  <AiSettingsCard state={state?.ai} busy={disabled} />
                  <TranslationSettingsCard options={state?.translationOptions} />
                  <AiCacheSettingsCard options={state?.aiCacheOptions} busy={disabled} />
                </>
              ),
            },
          ]}
        />

        {values && state && dirty && (
          <div className="actions settings-save-actions">
            <VscodeButton type="submit" disabled={disabled || !state.trusted}>
              {t('Save settings')}
            </VscodeButton>
            <VscodeButton type="button" secondary disabled={disabled} onClick={reset}>
              {t('Discard changes')}
            </VscodeButton>
            <small>{t('Unsaved changes')}</small>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {t(error)}
          </p>
        )}
        {state && !state.trusted && (
          <p className="error">{t('Trust this workspace before changing execution settings.')}</p>
        )}
      </form>
    </main>
  );
}
