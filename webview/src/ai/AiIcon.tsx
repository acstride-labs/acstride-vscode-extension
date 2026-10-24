import React from 'react';
import '@vscode/codicons/dist/codicon.css';
export function AiIcon({ kind }: { kind: 'translation' | 'hint' | 'debug' | 'coding' }) {
  if (kind === 'translation')
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        aria-hidden="true"
      >
        <path d="M2 4h9M6.5 2v2M4 4c.5 4 3 6 6 8M9 4c-.5 4-3 7-7 9M10 17l4-10 4 10M11.5 14h5" />
      </svg>
    );
  const icon = { hint: 'lightbulb', debug: 'bug', coding: 'code' }[kind];
  return <span className={`codicon codicon-${icon}`} aria-hidden="true" />;
}
