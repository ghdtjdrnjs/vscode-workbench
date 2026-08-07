import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BranchRef,
  ChangedFile,
  CommitDetail,
  CommitSummary,
  DiffLayout,
  DiffModel,
  DiffViewMode,
  RepositoryInfo,
} from '../../../src/shared/models';
import type { CommitFilters } from '../../../src/shared/protocol';
import { SplitPane } from '../../components/SplitPane';
import { EmptyState, ErrorState, ListSkeleton } from '../../components/States';
import { loadCommitDetail, loadCommitLog, loadDiff, loadRefs } from '../../api';
import { isSuperseded } from '../../vscode';
import { DiffViewer } from '../diff/DiffViewer';
import { BranchTree } from './BranchTree';
import { CommitDetails } from './CommitDetails';
import { CommitList } from './CommitList';
import { CommitSearchBar } from './CommitSearchBar';

interface CommitLogPageProps {
  repositories: readonly RepositoryInfo[];
  repositoryId: string;
  onSelectRepository: (repositoryId: string) => void;
  pageSize: number;
  showCommitGraph: boolean;
  refreshToken: number;
}

type DetailView =
  | { kind: 'commit' }
  | { kind: 'diff'; file: ChangedFile };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function CommitLogPage({
  repositories,
  repositoryId,
  onSelectRepository,
  pageSize,
  showCommitGraph,
  refreshToken,
}: CommitLogPageProps): JSX.Element {
  const [refs, setRefs] = useState<BranchRef[]>([]);
  const [filters, setFilters] = useState<CommitFilters>({ allRefs: true });

  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | undefined>();
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const [detail, setDetail] = useState<CommitDetail | undefined>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | undefined>();
  const [parentIndex, setParentIndex] = useState(0);
  const [selectedFileIndex, setSelectedFileIndex] = useState(-1);

  const [view, setView] = useState<DetailView>({ kind: 'commit' });
  const [diff, setDiff] = useState<DiffModel | undefined>();
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<DiffViewMode>('changes');
  const [layout, setLayout] = useState<DiffLayout>('unified');

  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (!repositoryId) {
      return;
    }

    void (async () => {
      try {
        setRefs(await loadRefs(repositoryId));
      } catch (error) {
        if (!isSuperseded(error)) {
          setListError(messageOf(error));
        }
      }
    })();
  }, [repositoryId, refreshToken]);

  const loadPage = useCallback(
    async (nextCursor?: string) => {
      if (!repositoryId) {
        return;
      }

      if (!nextCursor) {
        setListLoading(true);
        setListError(undefined);
      }

      try {
        const page = await loadCommitLog({
          repositoryId,
          filters,
          limit: pageSize,
          cursor: nextCursor,
        });

        setHasMore(page.hasMore);
        setCursor(page.nextCursor);
        setCommits(current =>
          nextCursor ? dedupe([...current, ...page.commits]) : page.commits,
        );

        if (!nextCursor) {
          setSelectedIndex(page.commits.length > 0 ? 0 : -1);
        }
      } catch (error) {
        if (!isSuperseded(error)) {
          setListError(messageOf(error));
        }
      } finally {
        if (!nextCursor) {
          setListLoading(false);
        }
        loadingMoreRef.current = false;
      }
    },
    [repositoryId, filters, pageSize],
  );

  useEffect(() => {
    setCommits([]);
    setSelectedIndex(-1);
    setDetail(undefined);
    setView({ kind: 'commit' });
    void loadPage(undefined);
  }, [loadPage, refreshToken]);

  const selectedCommit =
    selectedIndex >= 0 ? commits[selectedIndex] : undefined;

  useEffect(() => {
    if (!selectedCommit || !repositoryId) {
      setDetail(undefined);
      return undefined;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(undefined);

    void (async () => {
      try {
        const loaded = await loadCommitDetail({
          repositoryId,
          commitHash: selectedCommit.hash,
          parentIndex,
        });

        if (!cancelled) {
          setDetail(loaded);
          setSelectedFileIndex(loaded.changedFiles.length > 0 ? 0 : -1);
        }
      } catch (error) {
        if (!cancelled && !isSuperseded(error)) {
          setDetailError(messageOf(error));
          setDetail(undefined);
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCommit, repositoryId, parentIndex]);

  // 파일 diff 화면일 때만 diff를 읽는다.
  useEffect(() => {
    if (view.kind !== 'diff' || !selectedCommit || !repositoryId) {
      return undefined;
    }

    let cancelled = false;
    setDiffLoading(true);
    setDiffError(undefined);

    void (async () => {
      try {
        const loaded = await loadDiff({
          repositoryId,
          commitHash: selectedCommit.hash,
          parentIndex,
          oldPath: view.file.oldPath,
          newPath: view.file.newPath,
          mode: viewMode,
        });

        if (!cancelled) {
          setDiff(loaded);
        }
      } catch (error) {
        if (!cancelled && !isSuperseded(error)) {
          setDiffError(messageOf(error));
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
  }, [view, selectedCommit, repositoryId, parentIndex, viewMode]);

  const onSelectCommit = (index: number): void => {
    setSelectedIndex(index);
    setParentIndex(0);
    setView({ kind: 'commit' });
  };

  const onChangeParent = (index: number): void => {
    setParentIndex(index);
    // parent가 바뀌면 열려 있던 파일 diff는 닫는다.
    setView({ kind: 'commit' });
  };

  const onSelectAllRefs = (): void => {
    setFilters(current => ({ ...current, allRefs: true, ref: undefined }));
  };

  const onSelectRef = (ref: BranchRef): void => {
    setFilters(current => ({ ...current, allRefs: false, ref: ref.shortName }));
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
        <span className="page-title">Git Log</span>
        <select
          className="repo-select"
          aria-label="저장소 선택"
          value={repositoryId}
          onChange={event => onSelectRepository(event.currentTarget.value)}
        >
          {repositories.map(repository => (
            <option key={repository.id} value={repository.id}>
              {repository.name}
              {repository.headName ? ` (${repository.headName})` : ''}
            </option>
          ))}
        </select>
        <div className="toolbar-spacer" />
        <span className="page-count">
          {filters.allRefs ? '모든 브랜치' : filters.ref}
        </span>
      </header>

      <SplitPane
        storageKey="commitLog.branches"
        initialRatio={0.2}
        minRatio={0.12}
        maxRatio={0.4}
        first={
          <div className="pane">
            <BranchTree
              refs={refs}
              allRefs={filters.allRefs}
              selectedRef={filters.ref}
              onSelectAll={onSelectAllRefs}
              onSelectRef={onSelectRef}
            />
          </div>
        }
        second={
          <SplitPane
            storageKey="commitLog.detail"
            initialRatio={0.56}
            first={
              <div className="pane">
                <CommitSearchBar
                  filters={filters}
                  loadedCount={commits.length}
                  hasMore={hasMore}
                  onChange={setFilters}
                />
                {listLoading ? (
                  <ListSkeleton rows={16} />
                ) : listError ? (
                  <ErrorState
                    title="커밋 목록을 불러오지 못했습니다"
                    detail={listError}
                    action={{
                      label: '다시 시도',
                      onClick: () => void loadPage(),
                    }}
                  />
                ) : commits.length === 0 ? (
                  <EmptyState
                    title="조건에 맞는 커밋이 없습니다"
                    detail="검색 조건을 바꾸거나 초기화하세요."
                  />
                ) : (
                  <CommitList
                    commits={commits}
                    selectedIndex={selectedIndex}
                    showGraph={showCommitGraph}
                    onSelect={onSelectCommit}
                    onReachEnd={onReachEnd}
                  />
                )}
              </div>
            }
            second={
              <div className="pane">
                {view.kind === 'diff' ? (
                  <>
                    <div className="detail-nav">
                      <button
                        type="button"
                        onClick={() => setView({ kind: 'commit' })}
                      >
                        ← 커밋 상세로
                      </button>
                      <span className="detail-nav-path" title={view.file.newPath}>
                        {view.file.newPath}
                      </span>
                    </div>
                    <DiffViewer
                      diff={diff}
                      loading={diffLoading}
                      error={diffError}
                      viewMode={viewMode}
                      layout={layout}
                      onChangeViewMode={setViewMode}
                      onChangeLayout={setLayout}
                      title={view.file.newPath}
                      emptyLabel="변경 파일을 선택하세요."
                    />
                  </>
                ) : (
                  <CommitDetails
                    detail={detail}
                    loading={detailLoading}
                    error={detailError}
                    parentIndex={parentIndex}
                    selectedFileIndex={selectedFileIndex}
                    onChangeParent={onChangeParent}
                    onSelectFile={setSelectedFileIndex}
                    onOpenFile={file => setView({ kind: 'diff', file })}
                  />
                )}
              </div>
            }
          />
        }
      />
    </div>
  );
}

function dedupe(commits: CommitSummary[]): CommitSummary[] {
  const seen = new Set<string>();

  return commits.filter(commit => {
    if (seen.has(commit.hash)) {
      return false;
    }

    seen.add(commit.hash);
    return true;
  });
}
