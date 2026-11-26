import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BranchRef,
  ChangedFile,
  CommitDetail,
  CommitSummary,
  RepositoryInfo,
} from '../../../src/shared/models';
import type { CommitFilters } from '../../../src/shared/protocol';
import { ContextMenu } from '../../components/ContextMenu';
import { SplitPane } from '../../components/SplitPane';
import { EmptyState, ErrorState, ListSkeleton } from '../../components/States';
import {
  cherryPick,
  loadCommitDetail,
  loadCommitLog,
  loadRefs,
  openDiffInEditor,
} from '../../api';
import { getUiFlag, isSuperseded, setUiFlag } from '../../vscode';
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
  /**
   * File History의 'Show in Git Log'로 들어왔을 때 골라 줄 커밋.
   * App이 요청마다 key를 갈아 끼워 이 화면을 다시 만들기 때문에
   * 마운트 시점에 한 번만 읽으면 된다.
   */
  revealHash?: string;
}

const BRANCH_PANE_FLAG = 'commitLog.branchPaneOpen';

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
  revealHash,
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

  // 하단 패널은 폭이 좁다. 브랜치 영역은 기본으로 접어 두고 필요할 때만 펼친다.
  const [branchPaneOpen, setBranchPaneOpen] = useState(() =>
    getUiFlag(BRANCH_PANE_FLAG, false),
  );

  useEffect(() => {
    setUiFlag(BRANCH_PANE_FLAG, branchPaneOpen);
  }, [branchPaneOpen]);

  // 커밋 우클릭 메뉴. 열려 있는 위치와 대상 커밋을 함께 들고 있는다.
  const [menu, setMenu] = useState<
    { x: number; y: number; commit: CommitSummary } | undefined
  >();

  const loadingMoreRef = useRef(false);
  /** 갱신 후 같은 커밋을 다시 고르기 위해 직전 목록을 들고 있는다. */
  const commitsRef = useRef<CommitSummary[]>([]);
  commitsRef.current = commits;
  /** 아직 골라내지 못한 reveal 대상. 한 번 쓰고 비운다. */
  const revealRef = useRef(revealHash);

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
          nextCursor
            ? dedupe([...current, ...page.commits])
            : // 같은 커밋 목록이면 이전 배열을 그대로 둔다.
              // 새 배열로 바꾸면 selectedCommit의 identity가 바뀌어
              // 상세/diff effect가 다시 돌고 Loading이 화면을 덮는다.
              sameCommits(current, page.commits)
              ? current
              : page.commits,
        );

        if (!nextCursor && revealRef.current) {
          const reveal = revealRef.current;
          const revealIndex = page.commits.findIndex(
            commit => commit.hash === reveal,
          );
          // 한 번만 시도한다. 남겨 두면 이후 갱신마다 선택을 도로 끌어당긴다.
          revealRef.current = undefined;

          if (revealIndex >= 0) {
            setSelectedIndex(revealIndex);
            setParentIndex(0);
            return;
          }

          // 첫 페이지 밖이라 목록에 없다. hash를 검색어에 넣으면
          // CommitLogService가 직접 찾아 맨 앞에 붙여 준다.
          setFilters(current => ({ ...current, message: reveal }));
          return;
        }

        if (!nextCursor) {
          // 같은 커밋이 그대로 있으면 선택을 유지한다. 갱신 때 선택이 튀지 않게.
          setSelectedIndex(current => {
            const previousHash = commitsRef.current[current]?.hash;
            const sameIndex = previousHash
              ? page.commits.findIndex(commit => commit.hash === previousHash)
              : -1;

            if (sameIndex >= 0) {
              return sameIndex;
            }

            return page.commits.length > 0 ? 0 : -1;
          });
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

  // 저장소를 바꾸면 이전 저장소의 커밋이 남아 있으면 안 된다.
  // 남겨 두면 새 repositoryId와 옛 commit hash로 상세를 조회해 오류가 뜬다.
  // 저장소 전환은 사용자가 직접 하는 드문 동작이라 여기서는 스켈레톤이 맞다.
  useEffect(() => {
    setCommits([]);
    setSelectedIndex(-1);
    setDetail(undefined);
  }, [repositoryId]);

  // 필터 변경과 refresh에서는 목록을 비우지 않는다.
  // 비우면 갱신할 때마다 스켈레톤이 번쩍인다. 새 결과가 오면 loadPage가 갈아 끼운다.
  useEffect(() => {
    void loadPage(undefined);
  }, [loadPage, refreshToken]);

  const selectedCommit =
    selectedIndex >= 0 ? commits[selectedIndex] : undefined;
  // effect 의존성은 객체가 아니라 hash로 둔다.
  // 목록을 다시 읽으면 같은 커밋이라도 객체가 새로 만들어지기 때문이다.
  const selectedHash = selectedCommit?.hash;

  useEffect(() => {
    if (!selectedHash || !repositoryId) {
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
          commitHash: selectedHash,
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
  }, [selectedHash, repositoryId, parentIndex]);

  const onSelectCommit = (index: number): void => {
    setSelectedIndex(index);
    setParentIndex(0);
  };

  const onChangeParent = (index: number): void => {
    setParentIndex(index);
  };

  const onSelectAllRefs = (): void => {
    setFilters(current => ({ ...current, allRefs: true, ref: undefined }));
  };

  const onSelectRef = (ref: BranchRef): void => {
    setFilters(current => ({ ...current, allRefs: false, ref: ref.shortName }));
  };

  // 하단 패널은 폭이 좁다. 실제 코드는 VS Code diff 편집기에서 본다.
  const onOpenFile = (file: ChangedFile): void => {
    if (!selectedHash) {
      return;
    }

    void openDiffInEditor({
      repositoryId,
      commitHash: selectedHash,
      parentIndex,
      oldPath: file.oldPath,
      newPath: file.newPath,
    }).catch(error => {
      if (!isSuperseded(error)) {
        setDetailError(messageOf(error));
      }
    });
  };

  const onCherryPick = (commit: CommitSummary): void => {
    void (async () => {
      try {
        await cherryPick({ repositoryId, commitHash: commit.hash });
        // 성공하면 HEAD가 움직이므로 Extension Host가 알아서 갱신을 알린다.
      } catch (error) {
        if (!isSuperseded(error)) {
          setListError(messageOf(error));
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

      <div className="log-body">
        {/*
          rail은 접혀 있을 때만이 아니라 항상 그린다.
          펼칠 때 토글 버튼이 브랜치 패널 안쪽으로 옮겨 가면
          접으려고 마우스를 반대편까지 움직여야 한다.
        */}
        <div className="branch-rail">
          <button
            type="button"
            className="rail-toggle"
            aria-label={branchPaneOpen ? '브랜치 목록 접기' : '브랜치 목록 펼치기'}
            aria-expanded={branchPaneOpen}
            title={branchPaneOpen ? '브랜치 목록 접기' : '브랜치 목록 펼치기'}
            onClick={() => setBranchPaneOpen(current => !current)}
          >
            {branchPaneOpen ? '‹' : '›'}
          </button>
          {branchPaneOpen ? null : (
            <span className="rail-label">
              {filters.allRefs ? '모든 브랜치' : filters.ref}
            </span>
          )}
        </div>

        {/*
          바깥이 '커밋 목록 + 상세' 분할이고, 브랜치 분할은 그 안쪽에 둔다.
          반대로 중첩하면 브랜치 영역을 접고 펼 때 바깥 컨테이너 폭이 바뀌어
          커밋 목록과 상세가 같이 늘었다 줄었다 한다.
          이렇게 두면 상세 영역은 폭을 유지하고 커밋 목록만 늘고 준다.
        */}
        <SplitPane
          storageKey="commitLog.mainSplit"
          initialRatio={0.56}
          first={
            <MaybeSplit
              open={branchPaneOpen}
              branchPane={
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
            >
              <div className="pane">
                <CommitSearchBar
                  filters={filters}
                  loadedCount={commits.length}
                  hasMore={hasMore}
                  onChange={setFilters}
                />
                {listLoading && commits.length === 0 ? (
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
                    onContextMenu={(index, x, y) => {
                      const commit = commits[index];

                      if (commit) {
                        setMenu({ x, y, commit });
                      }
                    }}
                    onReachEnd={onReachEnd}
                  />
                )}
              </div>
            </MaybeSplit>
          }
          second={
            <div className="pane">
              <CommitDetails
                detail={detail}
                loading={detailLoading}
                error={detailError}
                parentIndex={parentIndex}
                selectedFileIndex={selectedFileIndex}
                onChangeParent={onChangeParent}
                onSelectFile={setSelectedFileIndex}
                onOpenFile={onOpenFile}
              />
            </div>
          }
        />
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(undefined)}
          items={[
            {
              label: `Cherry-Pick  ${menu.commit.shortHash}`,
              danger: true,
              onSelect: () => onCherryPick(menu.commit),
            },
          ]}
        />
      ) : null}
    </div>
  );
}

/**
 * 브랜치 영역이 펼쳐져 있으면 SplitPane으로, 접혀 있으면 children만 그린다.
 * 접었을 때 splitter가 남아 있으면 좁은 화면에서 공간을 낭비한다.
 */
function MaybeSplit({
  open,
  branchPane,
  children,
}: {
  open: boolean;
  branchPane: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  if (!open) {
    return <>{children}</>;
  }

  return (
    <SplitPane
      storageKey="commitLog.branchPane"
      // 이 비율의 기준은 전체 폭이 아니라 '브랜치 + 커밋 목록' 영역이다.
      // 0.36이면 전체 폭의 20% 남짓으로, 뒤집기 전과 같은 넓이가 된다.
      initialRatio={0.36}
      first={branchPane}
      second={children}
    />
  );
}

/** 같은 커밋이 같은 순서로 들어 있으면 true. 불필요한 재렌더를 막는다. */
function sameCommits(
  a: readonly CommitSummary[],
  b: readonly CommitSummary[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((commit, index) => commit.hash === b[index].hash);
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
