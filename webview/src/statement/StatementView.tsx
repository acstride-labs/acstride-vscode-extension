import React, { useEffect, useRef, useState } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';
import type { ContestHostMessage } from '../../../src/shared/contest-protocol';
import type { Statement } from '../../../src/domain/contest';
import { send } from '../bridge';
export function StatementView() {
  const [data, setData] = useState<{ contestId: number; index: string; statement: Statement }>();
  const content = useRef<HTMLDivElement>(null),
    key = useRef('');
  const scroll = useRef(new Map<string, number>());
  useEffect(() => {
    const listener = (event: MessageEvent<ContestHostMessage>) => {
      if (event.data.type !== 'statement') return;
      scroll.current.set(key.current, window.scrollY);
      key.current = `${event.data.contestId}/${event.data.index}`;
      setData(event.data);
    };
    window.addEventListener('message', listener);
    send({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, []);
  useEffect(() => {
    if (!content.current || !data) return;
    renderMathInElement(content.current, {
      delimiters: [
        { left: '$$$', right: '$$$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
      trust: false,
    });
    window.scrollTo(0, scroll.current.get(key.current) || 0);
  }, [data]);
  return (
    <main className="statement-view">
      <header>
        <span className="eyebrow">
          {data ? `CODEFORCES ${data.contestId} / ${data.index}` : 'CODEFORCES / STATEMENT'}
        </span>
        <p>
          {data
            ? data.statement.fetchedAt
              ? `Cached ${new Date(data.statement.fetchedAt).toLocaleString()}`
              : '题面未缓存 · 官方样例未下载'
            : 'Open a downloaded contest problem to read its statement.'}
        </p>
        {data?.statement.imageWarning && <p>{data.statement.imageWarning}</p>}
      </header>
      <div
        ref={content}
        className="statement"
        dangerouslySetInnerHTML={{ __html: data?.statement.html ?? '' }}
      />
    </main>
  );
}
