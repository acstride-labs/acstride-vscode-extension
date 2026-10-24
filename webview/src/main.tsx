import { Tabs } from './ui/Tabs';
import {
  Field,
  VscodeBadge,
  VscodeButton,
  VscodeCheckbox,
  VscodeTextarea,
  checkedOf,
  valueOf,
} from './ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AccountState, HostMessage } from '../../src/shared/protocol';
import type { Problem, TestCase, TestResult } from '../../src/domain/models';
import { completeResults, resultTone, retainResults } from './test-state';
import { send } from './bridge';
import { ContestPage } from './contest/ContestPage';
import { StatementView } from './statement/StatementView';
import { SettingsApp } from './settings/SettingsApp';
import { useI18n } from './i18n';
import './styles.css';
function App() {
  const [account, setAccount] = useState<AccountState>({ status: 'checking' });
  const [submitting, setSubmitting] = useState(false);
  const { t } = useI18n();
  const [problem, setProblem] = useState<Problem>();
  const [tests, setTests] = useState<TestCase[]>([]);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirtyTests, setDirtyTests] = useState<Record<string, boolean>>({});
  const currentProblem = useRef('');
  const previousTests = useRef<TestCase[]>([]);
  const runIds = useRef<string[]>([]);
  const [activeId, setActiveId] = useState('');
  const anyDirty = Object.values(dirtyTests).some(Boolean);
  const onDirty = useCallback(
    (id: string, dirty: boolean) =>
      setDirtyTests((old) => (old[id] === dirty ? old : { ...old, [id]: dirty })),
    [],
  );
  useEffect(() => {
    send({ type: 'draftState', dirty: anyDirty });
  }, [anyDirty]);
  useEffect(() => {
    const receive = (event: MessageEvent<HostMessage>) => {
      const m = event.data;
      if (m.type === 'accountState') {
        setAccount(m.account);
        return;
      }
      if (m.type === 'submitting') {
        setSubmitting(m.submitting);
        return;
      }
      if (m.type === 'state') {
        const key = `${m.problem.collection ?? 'contest'}/${m.problem.contestId ?? 'local'}/${m.problem.id}/${m.problem.language}`;
        if (currentProblem.current !== key) {
          setDirtyTests({});
          setResults({});
          previousTests.current = [];
          setActiveId(m.tests[0]?.id ?? '');
          setNotice('');
          setError('');
          currentProblem.current = key;
        }
        setProblem(m.problem);
        setTests(m.tests);
        const added = m.tests.find(
          (test) => !previousTests.current.some((old) => old.id === test.id),
        );
        if (previousTests.current.length && added) setActiveId(added.id);
        else
          setActiveId((old) =>
            m.tests.some((test) => test.id === old) ? old : (m.tests[0]?.id ?? ''),
          );
        const previous = previousTests.current;
        setResults((old) => retainResults(previous, m.tests, old));
        previousTests.current = m.tests;
        setDirtyTests((old) =>
          Object.fromEntries(
            Object.entries(old).filter(([id]) => m.tests.some((t) => t.id === id)),
          ),
        );
      }
      if (m.type === 'running') {
        setRunning(m.running);
        if (!m.running) setNotice((old) => (old === 'Running tests…' ? '' : old));
        if (m.running) {
          runIds.current = previousTests.current
            .filter((test) => !m.testId || test.id === m.testId)
            .map((test) => test.id);
          setResults((old) =>
            Object.fromEntries(Object.entries(old).filter(([id]) => !runIds.current.includes(id))),
          );
          setError('');
          setNotice('Running tests…');
        }
      }
      if (m.type === 'progress') setResults((old) => ({ ...old, [m.result.testId]: m.result }));
      if (m.type === 'result') {
        setResults((old) => completeResults(old, runIds.current, m.result));
        setError(m.result.compileError ?? '');
        setNotice(
          m.result.cancelled
            ? 'Run cancelled.'
            : m.result.compileError
              ? 'Compilation failed.'
              : '',
        );
      }
      if (m.type === 'error') setError(m.message);
    };
    window.addEventListener('message', receive);
    send({ type: 'ready' });
    return () => window.removeEventListener('message', receive);
  }, []);
  return (
    <main className="tests-pane">
      <div className="test-toolbar">
        <VscodeButton
          secondary
          disabled={running || anyDirty || !problem}
          title={t('Switch language')}
          onClick={() => send({ type: 'switchLanguage' })}
        >
          {problem?.language === 'python' ? 'Python 3' : 'C++'} ▾
        </VscodeButton>
        <VscodeButton
          disabled={running || anyDirty || !problem}
          onClick={() => problem && send({ type: 'run', target: problem })}
        >
          ▶ {t('Run all tests')}
        </VscodeButton>
        {problem?.contestId && (
          <>
            <VscodeButton
              secondary
              disabled={submitting}
              onClick={() => send({ type: 'copySource', target: problem })}
            >
              {t('Copy code and open submission')}
            </VscodeButton>
            <span
              className="submission-action"
              tabIndex={account.status !== 'signedIn' ? 0 : undefined}
              aria-describedby={account.status !== 'signedIn' ? 'submission-login-hint' : undefined}
            >
              <VscodeButton
                secondary
                disabled={running || submitting || account.status !== 'signedIn'}
                onClick={() => send({ type: 'submitSource', target: problem })}
              >
                {t(submitting ? 'Preparing submission…' : 'One-click submit')}
              </VscodeButton>
              {account.status !== 'signedIn' && (
                <span className="submission-help-icon" aria-hidden="true">
                  ?
                </span>
              )}
              {account.status !== 'signedIn' && (
                <span className="submission-login-hint" id="submission-login-hint">
                  {t(
                    account.status === 'checking'
                      ? 'Checking Codeforces login…'
                      : 'Sign in on the Settings page to enable one-click submission.',
                  )}{' '}
                  <VscodeButton className="text-link" onClick={() => send({ type: 'openLogin' })}>
                    {t('Go to sign in')}
                  </VscodeButton>
                </span>
              )}
            </span>
          </>
        )}
        {running && (
          <VscodeButton secondary onClick={() => send({ type: 'stop' })}>
            ■ {t('Stop')}
          </VscodeButton>
        )}
        <span role="status">{t(notice)}</span>
      </div>
      {error && (
        <pre className="error" role="alert">
          {t(error)}
        </pre>
      )}
      {tests.length === 0 && (
        <p>{t('No tests yet. Add an input and optionally an expected output.')}</p>
      )}
      <Tabs
        className="test-tabs"
        label={t('Tests')}
        value={activeId}
        onChange={setActiveId}
        actions={
          <VscodeButton
            secondary
            className="add-test"
            disabled={running || !problem}
            aria-label={t('Add test')}
            title={t('Add test')}
            onClick={() =>
              send({
                type: 'saveTest',
                test: { id: `custom-${Date.now()}`, input: '', expected: '' },
              })
            }
          >
            ＋
          </VscodeButton>
        }
        items={tests.map((test, index) => ({
          value: test.id,
          contentKey: `${problem?.collection ?? 'contest'}/${problem?.contestId ?? 'local'}/${problem?.id}/${test.id}`,
          className: resultTone(results[test.id]),
          label: (
            <>
              {results[test.id]
                ? resultTone(results[test.id]) === 'pass'
                  ? '✓ '
                  : resultTone(results[test.id]) === 'fail'
                    ? '✕ '
                    : '— '
                : ''}
              {t('Case {number}', { number: index + 1 })}
              {dirtyTests[test.id] ? ' •' : ''}
            </>
          ),
          content: (
            <TestCard
              key={`${problem?.collection ?? 'contest'}/${problem?.contestId ?? 'local'}/${problem?.id}/${test.id}`}
              test={test}
              problem={problem}
              result={results[test.id]}
              running={running}
              anyDirty={anyDirty}
              onDirty={onDirty}
            />
          ),
        }))}
      />
    </main>
  );
}
function TestCard({
  test,
  problem,
  result,
  running,
  anyDirty,
  onDirty,
}: {
  test: TestCase;
  problem?: Problem;
  result?: TestResult;
  running: boolean;
  anyDirty: boolean;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const [input, setInput] = useState(test.input),
    [expected, setExpected] = useState(test.expected ?? ''),
    [check, setCheck] = useState(test.expected !== undefined);
  useEffect(() => {
    setInput(test.input);
    setExpected(test.expected ?? '');
    setCheck(test.expected !== undefined);
  }, [test.id, test.input, test.expected]);
  const dirty =
    input !== test.input ||
    check !== (test.expected !== undefined) ||
    (check && expected !== test.expected);
  useEffect(() => {
    onDirty(test.id, dirty);
  }, [test.id, dirty, onDirty]);
  return (
    <section className="test-case">
      <div className="case-status">
        {test.readOnly && <small>{t('Official sample')}</small>}
        {result && (
          <VscodeBadge className={resultTone(result)}>
            {result.verdict} · {result.durationMs} ms
          </VscodeBadge>
        )}
      </div>
      <div className="columns">
        <Field>
          {t('Input')}
          <VscodeTextarea
            monospace
            label={t('{id} input', { id: test.id })}
            disabled={running || test.readOnly}
            value={input}
            onInput={(e) => setInput(valueOf(e))}
            spellCheck={false}
          />
        </Field>
        <Field>
          <VscodeCheckbox
            disabled={running || test.readOnly}
            checked={check}
            onChange={(e) => setCheck(checkedOf(e))}
            label={t('Expected output')}
          />
          <VscodeTextarea
            monospace
            label={t('{id} expected output', { id: test.id })}
            disabled={running || test.readOnly || !check}
            value={expected}
            onInput={(e) => setExpected(valueOf(e))}
            spellCheck={false}
          />
        </Field>
      </div>
      <div className="actions">
        {!test.readOnly && (
          <VscodeButton
            disabled={running || !dirty}
            onClick={() =>
              send({
                type: 'saveTest',
                test: { id: test.id, input, expected: check ? expected : undefined },
              })
            }
          >
            {dirty ? t('Save changes') : t('Saved')}
          </VscodeButton>
        )}
        <VscodeButton
          secondary
          disabled={running || anyDirty}
          onClick={() => problem && send({ type: 'run', testId: test.id, target: problem })}
        >
          {t('Run test')}
        </VscodeButton>
        {!test.readOnly && (
          <VscodeButton
            secondary
            disabled={running}
            onClick={() => send({ type: 'deleteTest', testId: test.id })}
          >
            {t('Delete')}
          </VscodeButton>
        )}
        {dirty && <small>{t('Unsaved changes')}</small>}
      </div>
      {result && (
        <div className="result">
          <h3>{t('Actual output')}</h3>
          <pre>{result.stdout || t('(empty)')}</pre>
          {result.difference && (
            <div className="difference">
              {t('First difference at token {token}', { token: result.difference.token })}
              <div className="columns">
                <div>
                  {t('Expected')}
                  <pre>{result.difference.expected ?? t('(missing token)')}</pre>
                </div>
                <div>
                  {t('Actual')}
                  <pre>{result.difference.actual ?? t('(missing token)')}</pre>
                </div>
              </div>
            </div>
          )}
          {result.stderr && (
            <>
              <h3>stderr</h3>
              <pre>{result.stderr}</pre>
            </>
          )}
        </div>
      )}
    </section>
  );
}
const mode = document.body.dataset.mode;
createRoot(document.getElementById('root')!).render(
  mode === 'settings' ? (
    <SettingsApp />
  ) : mode === 'contest' ? (
    <ContestPage />
  ) : mode === 'statement' ? (
    <StatementView />
  ) : (
    <App />
  ),
);
