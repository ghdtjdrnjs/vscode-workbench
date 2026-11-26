import type { FileHistoryEntry } from '../../../src/shared/models';
import { VirtualList } from '../../components/VirtualList';
import { formatDate } from '../../format';

interface FileHistoryListProps {
  entries: readonly FileHistoryEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onContextMenu?: (index: number, x: number, y: number) => void;
  onReachEnd?: () => void;
}

const ROW_HEIGHT = 46;

export function FileHistoryList({
  entries,
  selectedIndex,
  onSelect,
  onContextMenu,
  onReachEnd,
}: FileHistoryListProps): JSX.Element {
  return (
    <VirtualList
      items={entries}
      rowHeight={ROW_HEIGHT}
      ariaLabel="파일 수정 이력"
      selectedIndex={selectedIndex}
      onSelect={onSelect}
      onContextMenu={onContextMenu}
      onReachEnd={onReachEnd}
      keyOf={entry => entry.hash}
      renderRow={entry => (
        <div className="history-row">
          <div className="history-row-top">
            <span className="history-subject" title={entry.subject}>
              {entry.subject}
            </span>
            <span className="history-hash">{entry.shortHash}</span>
          </div>
          <div className="history-row-bottom">
            <span className="history-author">{entry.authorName}</span>
            <span className="history-date">{formatDate(entry.authorDate)}</span>
            {entry.status === 'R' && entry.previousPath ? (
              <span className="history-rename" title={entry.previousPath}>
                ← {entry.previousPath}
              </span>
            ) : null}
          </div>
        </div>
      )}
    />
  );
}
