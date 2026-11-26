import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DiffLayout,
  DiffModel,
  DiffViewMode,
  FileHistoryEntry,
} from '../../../src/shared/models';
import { ContextMenu } from '../../components/ContextMenu';
import { SplitPane } from '../../components/SplitPane';
import { EmptyState, ErrorState, ListSkeleton } from '../../components/States';
import { DiffViewer } from '../diff/DiffViewer';
import { ParentSelector } from '../commitLog/ParentSelector';
import {
  cherryPick,
  loadDiff,
  loadFileHistory,
  openDiffInEditor,
} from '../../api';
import { isSuperseded } from '../../vscode';
import { FileHistoryList } from './FileHistoryList';

interface FileHistoryPageProps {
  uri: string;
  fileName: string;
  repositoryName: string;
  pageSize: number;
  refreshToken: number;
  /**
   * 이 커밋을 Git Log 화면에서 열어 달라고 App에 알린다.
   * 파일이 속한 저장소를 함께 넘긴다. 여러 저장소를 연 작업 공간에서는
   * Git Log가 보고 있는 저장소가 이 파일의 저장소와 다를 수 있다.
   */
  onShowInCommitLog: (commitHash: string, repositoryId: string) => void;
}

export function FileHistoryPage({
  uri,
  fileName,
  repositoryName,
  pageSize,
  refreshToken,
  onShowInCommitLog,
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

  // 커밋 우클릭 메뉴. 열린 위치와 대상 커밋을 함께 들고 있는다.
  const [menu, setMenu] = useState<
    { x: number; y: number; entry: FileHistoryEntry } | undefined
  >();

  const loadingMoreRef = useRef(false);
  /** 갱신 후 같은 커밋을 다시 고르기 위해 직전 목록을 들고 있는다. */
  const entriesRef = useRef<FileHistoryEntry[]>([]);
  entriesRef.current = entries;
  const selectedIndexRef = useRef(-1);
  selectedIndexRef.current = selectedIndex;

  // 다른 파일로 바뀌면 이전 파일의 이력이 남아 있으면 안 된다.
  useEffect(() => {
    setEntries([]);
    setSelectedIndex(-1);
    setDiff(undefined);
  }, [uri]);

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
          nextCursor
            ? dedupe([...current, ...result.entries])
            : // 같은 이력이면 이전 배열을 유지한다.
              // 새 배열이면 selected의 identity가 바뀌어 diff가 다시 로드되고
              // 화면이 Loading으로 덮여 깜빡인다.
              sameEntries(current, result.entries)
              ? current
              : result.entries,
        );

        if (!nextCursor) {
          // 같은 커밋이 그대로 있으면 선택을 유지한다. 갱신 때 선택이 튀지 않게.
          const previousHash = entriesRef.current[selectedIndexRef.current]?.hash;
          const sameIndex = previousHash
            ? result.entries.findIndex(entry => entry.hash === previousHash)
            : -1;

          if (sameIndex >= 0) {
            setSelectedIndex(sameIndex);
          } else {
            setSelectedIndex(result.entries.length > 0 ? 0 : -1);
            setParentIndex(0);
          }
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
  // 목록을 미리 비우지 않는다. 비우면 갱신할 때마다 스켈레톤이 번쩍인다.
  useEffect(() => {
    setDiffError(undefined);
    void loadPage(undefined);
  }, [loadPage, refreshToken]);

  const selected = selectedIndex >= 0 ? entries[selectedIndex] : undefined;
  // effect 의존성은 객체가 아니라 문자열로 둔다.
  const selectedHash = selected?.hash;
  const selectedOldPath = selected?.previousPath;
  const selectedNewPath = selected?.pathAtCommit;

  // 선택한 커밋의 diff를 읽는다. 빠르게 이동해도 마지막 선택 결과만 남는다.
  useEffect(() => {
    if (!selectedHash || !selectedNewPath || !repositoryId) {
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
          commitHash: selectedHash,
          parentIndex,
          oldPath: selectedOldPath,
          newPath: selectedNewPath,
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
  }, [
    selectedHash,
    selectedOldPath,
    selectedNewPath,
    repositoryId,
    parentIndex,
    viewMode,
  ]);

  const onSelect = (index: number): void => {
    setSelectedIndex(index);
    setParentIndex(0);
  };

  const onCherryPick = (entry: FileHistoryEntry): void => {
    void (async () => {
      try {
        await cherryPick({ repositoryId, commitHash: entry.hash });
        // 성공하면 HEAD가 움직이므로 Extension Host가 알아서 갱신을 알린다.
      } catch (caught) {
        if (!isSuperseded(caught)) {
          setDiffError(messageOf(caught));
        }
      }
    })();
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
            {loading && entries.length === 0 ? (
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
                onContextMenu={(index, x, y) => {
                  const entry = entries[index];

                  if (entry) {
                    setMenu({ x, y, entry });
                  }
                }}
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
              onOpenInEditor={
                selectedHash && selectedNewPath
                  ? () => {
                      void openDiffInEditor({
                        repositoryId,
                        commitHash: selectedHash,
                        parentIndex,
                        oldPath: selectedOldPath,
                        newPath: selectedNewPath,
                      }).catch(error => {
                        if (!isSuperseded(error)) {
                          setDiffError(messageOf(error));
                        }
                      });
                    }
                  : undefined
              }
            />
          </div>
        }
      />

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(undefined)}
          items={[
            {
              label: `Cherry-Pick  ${menu.entry.shortHash}`,
              danger: true,
              onSelect: () => onCherryPick(menu.entry),
            },
            {
              label: 'Show in Git Log',
              onSelect: () =>
                onShowInCommitLog(menu.entry.hash, repositoryId),
            },
          ]}
        />
      ) : null}
    </div>
  );
}

/** 같은 커밋이 같은 순서로 들어 있으면 true. */
function sameEntries(
  a: readonly FileHistoryEntry[],
  b: readonly FileHistoryEntry[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every(
    (entry, index) =>
      entry.hash === b[index].hash && entry.pathAtCommit === b[index].pathAtCommit,
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
