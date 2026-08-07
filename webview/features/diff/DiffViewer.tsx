import { useEffect, useMemo, useState } from 'react';
import { EXPAND_STEP } from '../../../src/shared/constants';
import {
  buildDiffSegments,
  expandCollapsed,
} from '../../../src/shared/diffSegments';
import type {
  DiffLayout,
  DiffModel,
  DiffSegment,
  DiffViewMode,
} from '../../../src/shared/models';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { CollapsedRegion } from './CollapsedRegion';
import { SideBySideHunk } from './SideBySideDiff';
import { UnifiedHunk } from './UnifiedDiff';

interface DiffViewerProps {
  diff?: DiffModel;
  loading: boolean;
  error?: string;
  viewMode: DiffViewMode;
  layout: DiffLayout;
  onChangeViewMode: (mode: DiffViewMode) => void;
  onChangeLayout: (layout: DiffLayout) => void;
  title?: string;
  emptyLabel: string;
}

const STATUS_LABEL: Record<string, string> = {
  A: '추가됨',
  M: '수정됨',
  D: '삭제됨',
  R: '이름 변경',
  C: '복사됨',
  T: '타입 변경',
  U: '충돌',
};

export function DiffViewer({
  diff,
  loading,
  error,
  viewMode,
  layout,
  onChangeViewMode,
  onChangeLayout,
  title,
  emptyLabel,
}: DiffViewerProps): JSX.Element {
  return (
    <div className="diff-viewer">
      <div className="diff-toolbar">
        <div className="diff-title" title={title}>
          {title ? <PathLabel diff={diff} fallback={title} /> : null}
        </div>
        <div className="toolbar-spacer" />
        <div className="segmented" role="group" aria-label="표시 범위">
          <button
            type="button"
            aria-pressed={viewMode === 'changes'}
            className={viewMode === 'changes' ? 'active' : ''}
            onClick={() => onChangeViewMode('changes')}
          >
            변경 구간
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'full'}
            className={viewMode === 'full' ? 'active' : ''}
            disabled={diff ? !diff.fullViewAvailable : true}
            title={
              diff && !diff.fullViewAvailable
                ? diff.truncationReason ?? '전체 파일 보기를 사용할 수 없습니다.'
                : undefined
            }
            onClick={() => onChangeViewMode('full')}
          >
            전체 파일
          </button>
        </div>
        <div className="segmented" role="group" aria-label="표시 방식">
          <button
            type="button"
            aria-pressed={layout === 'unified'}
            className={layout === 'unified' ? 'active' : ''}
            onClick={() => onChangeLayout('unified')}
          >
            통합
          </button>
          <button
            type="button"
            aria-pressed={layout === 'side-by-side'}
            className={layout === 'side-by-side' ? 'active' : ''}
            onClick={() => onChangeLayout('side-by-side')}
          >
            나란히
          </button>
        </div>
      </div>

      <DiffBody
        diff={diff}
        loading={loading}
        error={error}
        viewMode={viewMode}
        layout={layout}
        emptyLabel={emptyLabel}
      />
    </div>
  );
}

function PathLabel({
  diff,
  fallback,
}: {
  diff?: DiffModel;
  fallback: string;
}): JSX.Element {
  if (!diff) {
    return <span>{fallback}</span>;
  }

  const status = STATUS_LABEL[diff.status] ?? diff.status;

  if (diff.status === 'R' && diff.oldFile.path && diff.newFile.path) {
    return (
      <span>
        <span className={`status-chip status-${diff.status}`}>{status}</span>
        <span className="path-old">{diff.oldFile.path}</span>
        <span className="path-arrow"> → </span>
        <span>{diff.newFile.path}</span>
      </span>
    );
  }

  return (
    <span>
      <span className={`status-chip status-${diff.status}`}>{status}</span>
      {diff.newFile.path ?? diff.oldFile.path ?? fallback}
    </span>
  );
}

function DiffBody({
  diff,
  loading,
  error,
  viewMode,
  layout,
  emptyLabel,
}: {
  diff?: DiffModel;
  loading: boolean;
  error?: string;
  viewMode: DiffViewMode;
  layout: DiffLayout;
  emptyLabel: string;
}): JSX.Element {
  const baseSegments = useMemo<DiffSegment[]>(() => {
    if (!diff) {
      return [];
    }

    if (
      viewMode === 'full' &&
      diff.fullViewAvailable &&
      diff.newFile.text !== undefined
    ) {
      return buildDiffSegments(
        diff.hunks,
        diff.oldFile.text ?? '',
        diff.newFile.text ?? '',
      );
    }

    return diff.hunks.map(hunk => ({ type: 'hunk', hunk }) as DiffSegment);
  }, [diff, viewMode]);

  const [segments, setSegments] = useState<DiffSegment[]>(baseSegments);

  useEffect(() => {
    setSegments(baseSegments);
  }, [baseSegments]);

  if (loading) {
    return <Loading label="diff를 불러오는 중" />;
  }

  if (error) {
    return <ErrorState title="diff를 표시할 수 없습니다" detail={error} />;
  }

  if (!diff) {
    return <EmptyState title={emptyLabel} />;
  }

  if (diff.binary) {
    return (
      <EmptyState
        title="Binary 파일"
        detail={`텍스트 diff를 표시할 수 없습니다.\nold: ${
          diff.oldFile.path ?? '(없음)'
        }\nnew: ${diff.newFile.path ?? '(없음)'}`}
      />
    );
  }

  if (segments.length === 0) {
    return (
      <EmptyState
        title="표시할 변경 내용이 없습니다"
        detail={
          diff.status === 'R'
            ? '경로만 바뀌고 내용은 동일합니다.'
            : '이 커밋에서 이 파일의 내용 변경이 없습니다.'
        }
      />
    );
  }

  const expand = (
    index: number,
    direction: 'top' | 'bottom' | 'all',
  ): void => {
    setSegments(current => {
      const target = current[index];

      if (!target || target.type !== 'collapsed') {
        return current;
      }

      const replacement = expandCollapsed(
        target,
        diff.newFile.text ?? '',
        direction,
        EXPAND_STEP,
      );

      return [
        ...current.slice(0, index),
        ...replacement,
        ...current.slice(index + 1),
      ];
    });
  };

  const hasCollapsed = segments.some(segment => segment.type === 'collapsed');

  return (
    <div className="diff-body">
      {diff.truncationReason ? (
        <div className="diff-notice">{diff.truncationReason}</div>
      ) : null}

      {viewMode === 'full' ? (
        <div className="diff-notice subtle">
          <button
            type="button"
            onClick={() =>
              setSegments(current =>
                current.flatMap(segment =>
                  segment.type === 'collapsed'
                    ? expandCollapsed(
                        segment,
                        diff.newFile.text ?? '',
                        'all',
                        EXPAND_STEP,
                      )
                    : [segment],
                ),
              )
            }
            disabled={!hasCollapsed}
          >
            모두 펼치기
          </button>
          <button type="button" onClick={() => setSegments(baseSegments)}>
            모두 접기
          </button>
        </div>
      ) : null}

      <div className={layout === 'unified' ? 'diff-lines' : 'diff-lines side'}>
        {segments.map((segment, index) =>
          segment.type === 'collapsed' ? (
            <CollapsedRegion
              key={`collapsed-${segment.newStart}-${index}`}
              count={segment.count}
              newStart={segment.newStart}
              columns={layout === 'unified' ? 1 : 2}
              onExpand={direction => expand(index, direction)}
            />
          ) : layout === 'unified' ? (
            <UnifiedHunk
              key={`hunk-${segment.hunk.newStart}-${index}`}
              hunk={segment.hunk}
              showHeader={viewMode === 'changes'}
            />
          ) : (
            <SideBySideHunk
              key={`hunk-${segment.hunk.newStart}-${index}`}
              hunk={segment.hunk}
              showHeader={viewMode === 'changes'}
            />
          ),
        )}
      </div>
    </div>
  );
}
