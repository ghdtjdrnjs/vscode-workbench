interface MessageProps {
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}

export function Loading({ label }: { label: string }): JSX.Element {
  return (
    <div className="state-block" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, detail, action }: MessageProps): JSX.Element {
  return (
    <div className="state-block">
      <strong>{title}</strong>
      {detail ? <span className="state-detail">{detail}</span> : null}
      {action ? (
        <button type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function ErrorState({ title, detail, action }: MessageProps): JSX.Element {
  return (
    <div className="state-block error" role="alert">
      <strong>{title}</strong>
      {detail ? <span className="state-detail">{detail}</span> : null}
      {action ? (
        <button type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

/** 로딩 중 목록 자리를 채우는 골격. */
export function ListSkeleton({ rows = 8 }: { rows?: number }): JSX.Element {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index} />
      ))}
    </div>
  );
}
