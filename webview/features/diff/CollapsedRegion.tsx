import { EXPAND_STEP } from '../../../src/shared/constants';

interface CollapsedRegionProps {
  count: number;
  newStart: number;
  columns: 1 | 2;
  onExpand: (direction: 'top' | 'bottom' | 'all') => void;
}

export function CollapsedRegion({
  count,
  newStart,
  columns,
  onExpand,
}: CollapsedRegionProps): JSX.Element {
  return (
    <div className="collapsed-region" data-columns={columns}>
      <button
        type="button"
        className="collapsed-button"
        aria-label={`위쪽 ${EXPAND_STEP}줄 펼치기`}
        title={`위쪽 ${EXPAND_STEP}줄 펼치기`}
        onClick={() => onExpand('top')}
      >
        ↑
      </button>
      <button
        type="button"
        className="collapsed-button"
        aria-label={`아래쪽 ${EXPAND_STEP}줄 펼치기`}
        title={`아래쪽 ${EXPAND_STEP}줄 펼치기`}
        onClick={() => onExpand('bottom')}
      >
        ↓
      </button>
      <button
        type="button"
        className="collapsed-label"
        onClick={() => onExpand('all')}
      >
        변경되지 않은 {count}줄 (line {newStart}~{newStart + count - 1}) 펼치기
      </button>
    </div>
  );
}
