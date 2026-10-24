import React from 'react';
/** Original 24px line icons with a shared, legible AI corner signature. */
export function AiIcon({ kind }: { kind: 'translation' | 'hint' | 'debug' | 'coding' }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'translation' && (
        <>
          <path d="M2 5h10M7 2v3M4 5c1 4 3 6 7 8M10 5c-1 4-4 7-8 9M11 14l3-8 3 8M12 12h4" />
        </>
      )}
      {kind === 'hint' && (
        <>
          <path d="M3 3h11v10H8l-4 3v-3H3zM6 6h5M6 9h3M9 16h3M9 19h2" />
          <path d="M16 3l.7 1.7L18.5 5l-1.8.6L16 7l-.5-1.4L14 5l1.5-.3z" />
        </>
      )}
      {kind === 'debug' && (
        <>
          <ellipse cx="8" cy="9" rx="3.5" ry="4.5" />
          <path d="M8 5v8M5.5 5L4 3M10.5 5L12 3M4 8H2M4 11H2M11.5 8H13M5 13l-2 2" />
          <circle cx="14" cy="14" r="3.5" />
          <path d="M16.5 16.5l2 2" />
        </>
      )}
      {kind === 'coding' && (
        <>
          <path d="M4 3h9l4 4v6M4 3v16h6M13 3v4h4M8 8l-2 2 2 2M12 8l2 2-2 2M10.5 8l-1 4" />
        </>
      )}
      <rect
        x="12"
        y="15"
        width="11"
        height="8"
        rx="2"
        fill="var(--vscode-editor-background)"
        strokeWidth="1"
      />
      <path d="M14 21l1.5-4 1.5 4M14.5 19.5h2M19 17h2M20 17v4M19 21h2" strokeWidth="1.1" />
    </svg>
  );
}
