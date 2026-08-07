import { useCallback, useEffect, useRef, useState } from 'react';
import { getSplitRatio, setSplitRatio } from '../vscode';

interface SplitPaneProps {
  /** 첫 번째 pane의 초기 비율(0~1). */
  initialRatio: number;
  minRatio?: number;
  maxRatio?: number;
  storageKey: string;
  first: React.ReactNode;
  second: React.ReactNode;
}

export function SplitPane({
  initialRatio,
  minRatio = 0.15,
  maxRatio = 0.85,
  storageKey,
  first,
  second,
}: SplitPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(() =>
    getSplitRatio(storageKey, initialRatio),
  );
  const [dragging, setDragging] = useState(false);

  const clamp = useCallback(
    (value: number) => Math.min(maxRatio, Math.max(minRatio, value)),
    [minRatio, maxRatio],
  );

  useEffect(() => {
    if (!dragging) {
      return undefined;
    }

    const onMove = (event: MouseEvent): void => {
      const container = containerRef.current;

      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();

      if (rect.width === 0) {
        return;
      }

      setRatio(clamp((event.clientX - rect.left) / rect.width));
    };

    const onUp = (): void => setDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, clamp]);

  useEffect(() => {
    setSplitRatio(storageKey, ratio);
  }, [ratio, storageKey]);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setRatio(current => clamp(current - 0.02));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setRatio(current => clamp(current + 0.02));
    }
  };

  return (
    <div className="split-pane" ref={containerRef}>
      <div className="split-pane-first" style={{ width: `${ratio * 100}%` }}>
        {first}
      </div>
      <div
        className={dragging ? 'split-handle dragging' : 'split-handle'}
        role="separator"
        aria-orientation="vertical"
        aria-label="영역 크기 조절"
        tabIndex={0}
        onMouseDown={() => setDragging(true)}
        onKeyDown={onKeyDown}
      />
      <div className="split-pane-second">{second}</div>
    </div>
  );
}
