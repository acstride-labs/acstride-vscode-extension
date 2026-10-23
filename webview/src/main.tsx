import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { HostMessage, WebviewRequest } from '../../src/shared/protocol';
import type { Problem, TestCase, TestResult } from '../../src/domain/models';
import { languages } from '../../src/domain/languages';
import { send } from './bridge';
import { ContestApp } from './contest/ContestApp';
import { StatementView } from './statement/StatementView';
import './styles.css';
function App() {
  const [problem, setProblem] = useState<Problem>();
  const [tests, setTests] = useState<TestCase[]>([]);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirtyTests, setDirtyTests] = useState<Record<string, boolean>>({});
  const currentProblem = useRef('');
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
      if (m.type === 'state') {
        const key = `${m.problem.contestId ?? 'local'}/${m.problem.id}/${m.problem.language}`;
        if (currentProblem.current !== key) {
          setDirtyTests({});
          setNotice('');
          setError('');
          currentProblem.current = key;
        }
        setProblem(m.problem);
        setTests(m.tests);
        setResults({});
        setDirtyTests((old) =>
          Object.fromEntries(
            Object.entries(old).filter(([id]) => m.tests.some((t) => t.id === id)),
          ),
        );
      }
      if (m.type === 'running') {
        setRunning(m.running);
        if (m.running) {
          setResults({});
          setError('');
          setNotice('Running tests…');
        }
      }
      if (m.type === 'progress') setResults((old) => ({ ...old, [m.result.testId]: m.result }));
      if (m.type === 'result') {
        setResults(Object.fromEntries(m.result.results.map((r) => [r.testId, r])));
        setError(m.result.compileError ?? '');
        setNotice(
          m.result.cancelled
            ? 'Run cancelled.'
            : m.result.compileError
              ? 'Compilation failed.'
              : 'Run complete. Local test results are not an official verdict.',
        );
      }
      if (m.type === 'error') setError(m.message);
    };
    window.addEventListener('message', receive);
    send({ type: 'ready' });
    return () => window.removeEventListener('message', receive);
  }, []);
  return (
    <main>
      <header>
        <span className="eyebrow">
          CFIDE / {problem?.contestId ? `CONTEST ${problem.contestId}` : 'LOCAL WORKBENCH'}
        </span>
        <h1>{problem ? `${problem.id} · ${problem.title}` : 'Tests'}</h1>
        <p>
          {problem ? languages[problem.language].label : 'C++ / Python 3'} · Test locally. See what
          changed.
        </p>
      </header>
      <nav>
        <button
          className="secondary"
          disabled={running || anyDirty || !problem}
          onClick={() => send({ type: 'switchLanguage' })}
        >
          Switch language
        </button>
        {problem?.contestId && (
          <button disabled={running || anyDirty} onClick={() => send({ type: 'copySource' })}>
            Copy solution code
          </button>
        )}
        <button disabled={running || anyDirty || !problem} onClick={() => send({ type: 'run' })}>
          ▶ Run all tests
        </button>
        <button className="secondary" disabled={!running} onClick={() => send({ type: 'stop' })}>
          ■ Stop
        </button>
        <button
          className="secondary"
          disabled={running || !problem}
          onClick={() =>
            send({
              type: 'saveTest',
              test: { id: `custom-${Date.now()}`, input: '', expected: '' },
            })
          }
        >
          ＋ Add test
        </button>
      </nav>
      <p aria-live="polite">{notice}</p>
      {error && (
        <pre className="error" role="alert">
          {error}
        </pre>
      )}
      {tests.length === 0 && <p>No tests yet. Add an input and optionally an expected output.</p>}
      {tests.map((test) => (
        <TestCard
          key={`${problem?.contestId ?? 'local'}/${problem?.id}/${test.id}`}
          test={test}
          result={results[test.id]}
          running={running}
          anyDirty={anyDirty}
          onDirty={onDirty}
        />
      ))}
      <footer>
        Token comparison ignores whitespace. Uncheck expected output for run-only mode. Changes must
        be saved before running.
      </footer>
    </main>
  );
}
function TestCard({
  test,
  result,
  running,
  anyDirty,
  onDirty,
}: {
  test: TestCase;
  result?: TestResult;
  running: boolean;
  anyDirty: boolean;
  onDirty: (id: string, dirty: boolean) => void;
}) {
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
    <section className="card">
      <div className="card-title">
        <h2>{test.id}</h2>
        {result && (
          <span className={`badge ${result.verdict === 'AC' ? 'pass' : ''}`}>
            {result.verdict} · {result.durationMs} ms
          </span>
        )}
      </div>
      <div className="columns">
        <label>
          Input
          <textarea
            aria-label={`${test.id} input`}
            disabled={running || test.readOnly}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
        </label>
        <label>
          <span>
            <input
              type="checkbox"
              disabled={running || test.readOnly}
              checked={check}
              onChange={(e) => setCheck(e.target.checked)}
            />{' '}
            Expected output
          </span>
          <textarea
            aria-label={`${test.id} expected output`}
            disabled={running || test.readOnly || !check}
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            spellCheck={false}
          />
        </label>
      </div>
      <div className="actions">
        <button
          disabled={running || test.readOnly || !dirty}
          onClick={() =>
            send({
              type: 'saveTest',
              test: { id: test.id, input, expected: check ? expected : undefined },
            })
          }
        >
          {test.readOnly ? 'Official sample' : dirty ? 'Save changes' : 'Saved'}
        </button>
        <button
          className="secondary"
          disabled={running || anyDirty}
          onClick={() => send({ type: 'run', testId: test.id })}
        >
          Run test
        </button>
        <button
          className="secondary"
          disabled={running || test.readOnly}
          onClick={() => send({ type: 'deleteTest', testId: test.id })}
        >
          Delete
        </button>
        {dirty && <small>Unsaved changes</small>}
      </div>
      {result && (
        <div className="result">
          <h3>Actual output</h3>
          <pre>{result.stdout || '(empty)'}</pre>
          {result.difference && (
            <div className="difference">
              First difference at token {result.difference.token}
              <div className="columns">
                <div>
                  Expected<pre>{result.difference.expected ?? '(missing token)'}</pre>
                </div>
                <div>
                  Actual<pre>{result.difference.actual ?? '(missing token)'}</pre>
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
  mode === 'contest' ? <ContestApp /> : mode === 'statement' ? <StatementView /> : <App />,
);
