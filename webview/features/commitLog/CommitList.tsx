import { useMemo } from 'react';
import type { CommitSummary } from '../../../src/shared/models';
import { VirtualList } from '../../components/VirtualList';
import { formatDate } from '../../format';
import { computeGraph } from './commitGraph';
import { CommitGraphCell, GRAPH_LANE_WIDTH, GRAPH_MAX_LANES } from './CommitGraphCell';

interface CommitListProps {
  commits: readonly CommitSummary[];
  selectedIndex: number;
  showGraph: boolean;
  onSelect: (index: number) => void;
  onReachEnd?: () => void;
}

const ROW_HEIGHT = 24;

export function CommitList({
  commits,
  selectedIndex,
  showGraph,
  onSelect,
  onReachEnd,
}: CommitListProps): JSX.Element {
  const graph = useMemo(
    () => (showGraph ? computeGraph(commits) : undefined),
    [commits, showGraph],
  );

  const graphWidth = graph
    ? Math.min(graph.laneCount, GRAPH_MAX_LANES) * GRAPH_LANE_WIDTH
    : 0;

  return (
    <VirtualList
      items={commits}
      rowHeight={ROW_HEIGHT}
      ariaLabel="커밋 목록"
      selectedIndex={selectedIndex}
      onSelect={onSelect}
      onReachEnd={onReachEnd}
      keyOf={commit => commit.hash}
      renderRow={(commit, index) => (
        <div className="commit-row">
          {graph ? (
            <span className="commit-graph-cell" style={{ width: graphWidth }}>
              <CommitGraphCell
                row={graph.rows[index]}
                laneCount={graph.laneCount}
                height={ROW_HEIGHT}
              />
            </span>
          ) : null}
          <span className="commit-subject" title={commit.subject}>
            {commit.decorations.map(decoration => (
              <span className="decoration" key={decoration}>
                {decoration}
              </span>
            ))}
            {commit.subject}
          </span>
          <span className="commit-author">{commit.authorName}</span>
          <span className="commit-date">{formatDate(commit.authorDate)}</span>
          <span className="commit-hash">{commit.shortHash}</span>
        </div>
      )}
    />
  );
}
