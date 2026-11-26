import { useCallback, useEffect, useRef, useState } from 'react';
import { getSplitRatio, setSplitRatio } from '../vscode';
import { MIN_PANE_SIZE, clampRatio, ratioFromDrag } from './splitRatio';

export type SplitOrientation = 'horizontal' | 'vertical';

export { MIN_PANE_SIZE, clampRatio, ratioFromDrag } from './splitRatio';

interface SplitPaneProps {
  /** 첫 번째 pane의 초기 비율(0~1). */
  initialRatio: number;
  /** 양쪽 pane의 최소 크기(px). 기본값을 그대로 쓰는 것을 권장한다. */
  minSize?: number;
  storageKey: string;
  /** horizontal이면 좌우로, vertical이면 위아래로 나눈다. */
  orientation?: SplitOrientation;
  first: React.ReactNode;
  second: React.ReactNode;
}

interface DragState {
  /** 잡은 순간의 포인터 좌표. */
  origin: number;
  /** 잡은 순간의 비율. 여기에 이동량만 더한다. */
  originRatio: number;
  /** 잡은 순간의 컨테이너 크기. 드래그 중에는 바뀌지 않는다. */
  total: number;
}

export function SplitPane({
  initialRatio,
  minSize = MIN_PANE_SIZE,
  storageKey,
  orientation = 'horizontal',
  first,
  second,
}: SplitPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | undefined>(undefined);
  const [ratio, setRatio] = useState(() =>
    getSplitRatio(storageKey, initialRatio),
  );
  const [dragging, setDragging] = useState(false);

  const vertical = orientation === 'vertical';

  const totalSize = useCallback((): number => {
    const rect = containerRef.current?.getBoundingClientRect();

    if (!rect) {
      return 0;
    }

    return vertical ? rect.height : rect.width;
  }, [vertical]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const total = totalSize();

    if (total === 0) {
      return;
    }

    dragRef.current = {
      origin: vertical ? event.clientY : event.clientX,
      originRatio: ratio,
      total,
    };

    // 포인터를 손잡이에 묶어 둔다. 커서가 다른 요소 위로 가도 드래그가 끊기지 않는다.
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    event.preventDefault();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;

    if (!drag) {
      return;
    }

    const delta = (vertical ? event.clientY : event.clientX) - drag.origin;

    setRatio(ratioFromDrag(drag.originRatio, delta, drag.total, minSize));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) {
      return;
    }

    dragRef.current = undefined;
    setDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // 드래그 중에는 텍스트 선택과 커서가 흔들리지 않게 잠근다.
  useEffect(() => {
    if (!dragging) {
      return undefined;
    }

    const cursor = vertical ? 'row-resize' : 'col-resize';
    document.body.classList.add('resizing');
    document.body.style.cursor = cursor;

    return () => {
      document.body.classList.remove('resizing');
      document.body.style.cursor = '';
    };
  }, [dragging, vertical]);

  useEffect(() => {
    setSplitRatio(storageKey, ratio);
  }, [ratio, storageKey]);

  const nudge = (delta: number): void => {
    const total = totalSize();
    setRatio(current => ratioFromDrag(current, delta, total, minSize));
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const decrease = vertical ? 'ArrowUp' : 'ArrowLeft';
    const increase = vertical ? 'ArrowDown' : 'ArrowRight';
    const step = event.shiftKey ? 40 : 12;

    if (event.key === decrease) {
      event.preventDefault();
      nudge(-step);
    } else if (event.key === increase) {
      event.preventDefault();
      nudge(step);
    }
  };

  // 최소·최대 크기는 CSS(min-width/max-width)가 layout 시점에 강제한다.
  // JS로 재면서 비율을 고쳐 쓰면, 패널이 리레이아웃될 때마다 저장값이 밀려
  // 결국 한쪽 끝에 고정된다. 저장하는 값은 사용자의 의도 그대로 둔다.
  const firstStyle = vertical
    ? { height: `${ratio * 100}%` }
    : { width: `${ratio * 100}%` };

  return (
    <div
      className={vertical ? 'split-pane vertical' : 'split-pane'}
      ref={containerRef}
    >
      <div className="split-pane-first" style={firstStyle}>
        {first}
      </div>
      <div
        className={dragging ? 'split-handle dragging' : 'split-handle'}
        role="separator"
        aria-orientation={vertical ? 'horizontal' : 'vertical'}
        aria-label="영역 크기 조절"
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() =>
          setRatio(clampRatio(initialRatio, totalSize(), minSize))
        }
        onKeyDown={onKeyDown}
      />
      <div className="split-pane-second">{second}</div>
    </div>
  );
}
