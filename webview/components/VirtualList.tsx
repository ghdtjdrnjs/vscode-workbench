import { useCallback, useEffect, useRef, useState } from 'react';

interface VirtualListProps<T> {
  items: readonly T[];
  rowHeight: number;
  overscan?: number;
  ariaLabel: string;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onActivate?: (index: number) => void;
  /** 마지막 행이 보이면 호출한다. 무한 스크롤용. */
  onReachEnd?: () => void;
  renderRow: (item: T, index: number, selected: boolean) => React.ReactNode;
  keyOf: (item: T, index: number) => string;
}

/**
 * 고정 행 높이 기반의 최소 가상 목록.
 * 외부 라이브러리 없이 목록 수천 건에서 DOM 노드 수를 일정하게 유지한다.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  overscan = 8,
  ariaLabel,
  selectedIndex,
  onSelect,
  onActivate,
  onReachEnd,
  renderRow,
  keyOf,
}: VirtualListProps<T>): JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const element = viewportRef.current;

    if (!element) {
      return undefined;
    }

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];

      if (entry) {
        setViewportHeight(entry.contentRect.height);
      }
    });

    observer.observe(element);
    setViewportHeight(element.clientHeight);

    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget;
      setScrollTop(target.scrollTop);

      if (
        onReachEnd &&
        target.scrollHeight - target.scrollTop - target.clientHeight < rowHeight * 4
      ) {
        onReachEnd();
      }
    },
    [onReachEnd, rowHeight],
  );

  // 선택 항목이 화면 밖이면 스크롤을 맞춘다.
  useEffect(() => {
    const element = viewportRef.current;

    if (!element || selectedIndex < 0) {
      return;
    }

    const top = selectedIndex * rowHeight;
    const bottom = top + rowHeight;

    if (top < element.scrollTop) {
      element.scrollTop = top;
    } else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight;
    }
  }, [selectedIndex, rowHeight]);

  const total = items.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount =
    Math.ceil((viewportHeight || rowHeight * 20) / rowHeight) + overscan * 2;
  const endIndex = Math.min(total, startIndex + visibleCount);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (total === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onSelect(Math.min(total - 1, selectedIndex + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      onSelect(Math.max(0, selectedIndex - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onSelect(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      onSelect(total - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (onActivate && selectedIndex >= 0) {
        onActivate(selectedIndex);
      }
    } else if (event.key === ' ') {
      event.preventDefault();
      if (selectedIndex >= 0) {
        onSelect(selectedIndex);
      }
    }
  };

  const rows: React.ReactNode[] = [];

  for (let index = startIndex; index < endIndex; index += 1) {
    const item = items[index];
    const selected = index === selectedIndex;

    rows.push(
      <div
        className={selected ? 'virtual-row selected' : 'virtual-row'}
        key={keyOf(item, index)}
        role="option"
        aria-selected={selected}
        style={{ top: index * rowHeight, height: rowHeight }}
        onClick={() => onSelect(index)}
        onDoubleClick={() => onActivate?.(index)}
      >
        {renderRow(item, index, selected)}
      </div>,
    );
  }

  return (
    <div
      className="virtual-viewport"
      ref={viewportRef}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={undefined}
    >
      <div className="virtual-sizer" style={{ height: total * rowHeight }}>
        {rows}
      </div>
    </div>
  );
}
