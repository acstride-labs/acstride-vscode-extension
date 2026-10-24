import React from 'react';

export function RefreshButton({
  label,
  disabled,
  busy = false,
  onClick,
}: {
  label: string;
  disabled: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="secondary contest-refresh-icon"
      disabled={disabled || busy}
      aria-busy={busy}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <svg
        className={busy ? 'refresh-spinning' : undefined}
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        aria-hidden="true"
      >
        <path d="M13.5 6A5.5 5.5 0 0 0 3 5M2.5 10A5.5 5.5 0 0 0 13 11M3 1.5V5h3.5M13 14.5V11H9.5" />
      </svg>
    </button>
  );
}

export function RefreshFeedback({ message, notice }: { message?: string; notice?: string }) {
  return (
    <span className="refresh-feedback" role="status" aria-live="polite">
      {message || notice || ''}
    </span>
  );
}
