import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DiffLayout,
  DiffModel,
  DiffViewMode,
  FileHistoryEntry,
} from '../../../src/shared/models';
import { SplitPane } from '../../components/SplitPane';
import { EmptyState, ErrorState, ListSkeleton } from '../../components/States';
import { DiffViewer } from '../diff/DiffViewer';
import { ParentSelector } from '../commitLog/ParentSelector';
import { loadDiff, loadFileHistory } from '../../api';
import { isSuperseded } from '../../vscode';
import { FileHistoryList } from './FileHistoryList';

interface FileHistoryPageProps {
  uri: string;
  fileName: string;
  repositoryName: string;
  pageSize: number;
  refreshToken: number;
}

export function FileHistoryPage({
  uri,
  fileName,
  repositoryName,
  pageSize,
  refreshToken,
}: FileHistoryPageProps): JSX.Element {
  const [entries, setEntries] = useState<FileHistoryEntry[]>([]);
  const [relativePath, setRelativePath] = useState('');
  const [repositoryId, setRepositoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  const [parentIndex, setParentIndex] = useState(0);
  const [diff, setDiff] = useState<DiffModel | undefined>();
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<DiffViewMode>('changes');
  const [layout, setLayout] = useState<DiffLayout>('unified');

  const loadingMoreRef = useRef(false);

  const loadPage = useCallback(
    async (nextCursor?: string) => {
      if (!nextCursor) {
        setLoading(true);
        setError(undefined);
      }

      try {
        const result = await loadFileHistory({
          uri,
          limit: pageSize,
          cursor: nextCursor,
        });

        setRelativePath(result.relativePath);
        setRepositoryId(result.repository.id);
        setHasMore(result.hasMore);
        setCursor(result.nextCursor);
        setEntries(current =>
          nextCursor ? dedupe([...current, ...result.entries]) : result.entries,
        );

        if (!nextCursor) {
          setSelectedIndex(result.entries.length > 0 ? 0 : -1);
          setParentIndex(0);
        }
      } catch (caught) {
        if (!isSuperseded(caught)) {
          setError(messageOf(caught));
        }
      } finally {
        if (!nextCursor) {
          setLoading(false);
        }
        loadingMoreRef.current = false;
      }
    },
    [uri, pageSize],
  );

  // 파일이 바뀌거나 refresh하면 처음부터 다시 읽는다.
  useEffect(() => {
    setEntries([]);
    setSelectedIndex(-1);
    setDiff(undefined);
    setDiffError(undefined);
    void loadPage(undefined);
  }, [loadPage, refreshToken]);

  const selected = selectedIndex >= 0 ? entries[selectedIndex] : undefined;

  // 선택한 커밋의 diff를 읽는다. 빠르게 이동해도 마지막 선택 결과만 남는다.
  useEffect(() => {
    if (!selected || !repositoryId) {
      setDiff(undefined);
      return;
    }

    let cancelled = false;
    setDiffLoading(true);
    setDiffError(undefined);

    void (async () => {
      try {
        const loaded = await loadDiff({
          repositoryId,
          commitHash: selected.hash,
          parentIndex,
          oldPath: selected.previousPath,
          newPath: selected.pathAtCommit,
          mode: viewMode,
        });

        if (!cancelled) {
          setDiff(loaded);
        }
      } catch (caught) {
        if (!cancelled && !isSuperseded(caught)) {
          setDiffError(messageOf(caught));
          setDiff(undefined);
        }
      } finally {
        if (!cancelled) {
          setDiffLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected, repositoryId, parentIndex, viewMode]);

  const onSelect = (index: number): void => {
    setSelectedIndex(index);
    setParentIndex(0);
  };

  const onReachEnd = (): void => {
    if (hasMore && cursor && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      void loadPage(cursor);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <span className="page-title">File History</span>
        <span className="page-subtitle" title={relativePath || fileName}>
          {relativePath || fileName}
        </span>
        <span className="page-badge">{repositoryName}</span>
        <div className="toolbar-spacer" />
        <span className="page-count">
          {entries.length}건{hasMore ? '+' : ''}
        </span>
      </header>

      <SplitPane
        storageKey="fileHistory"
        initialRatio={0.32}
        first={
          <div className="pane">
            {loading ? (
              <ListSkeleton />
            ) : error ? (
              <ErrorState
                title="이력을 불러오지 못했습니다"
                detail={error}
                action={{ label: '다시 시도', onClick: () => void loadPage() }}
              />
            ) : entries.length === 0 ? (
              <EmptyState
                title="커밋 이력이 없습니다"
                detail="이 파일에 대한 commit 이력이 없습니다."
              />
            ) : (
              <FileHistoryList
                entries={entries}
                selectedIndex={selectedIndex}
                onSelect={onSelect}
                onReachEnd={onReachEnd}
              />
            )}
          </div>
        }
        second={
          <div className="pane">
            {selected && selected.parentHashes.length > 1 ? (
              <ParentSelector
                parentHashes={selected.parentHashes}
                parentIndex={parentIndex}
                onChange={setParentIndex}
              />
            ) : null}
            <DiffViewer
              diff={diff}
              loading={diffLoading}
              error={diffError}
              viewMode={viewMode}
              layout={layout}
              onChangeViewMode={setViewMode}
              onChangeLayout={setLayout}
              title={selected?.pathAtCommit ?? relativePath}
              emptyLabel="왼쪽에서 커밋을 선택하세요."
            />
          </div>
        }
      />
    </div>
  );
}

function dedupe(entries: FileHistoryEntry[]): FileHistoryEntry[] {
  const seen = new Set<string>();

  return entries.filter(entry => {
    if (seen.has(entry.hash)) {
      return false;
    }

    seen.add(entry.hash);
    return true;
  });
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
