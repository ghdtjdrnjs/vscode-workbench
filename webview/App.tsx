import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_COMMIT_PAGE_SIZE,
  DEFAULT_FILE_HISTORY_PAGE_SIZE,
} from '../src/shared/constants';
import type { RepositoryInfo } from '../src/shared/models';
import type { WorkbenchSettings } from '../src/shared/protocol';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ErrorState, Loading } from './components/States';
import { listRepositories, ping } from './api';
import { CommitLogPage } from './features/commitLog/CommitLogPage';
import { FileHistoryPage } from './features/fileHistory/FileHistoryPage';
import { isSuperseded, onNotification } from './vscode';

type Route =
  | { name: 'commitLog'; revealHash?: string; revealToken?: number }
  | { name: 'fileHistory'; uri: string; fileName: string; repositoryName: string };

const DEFAULT_SETTINGS: WorkbenchSettings = {
  commitPageSize: DEFAULT_COMMIT_PAGE_SIZE,
  fileHistoryPageSize: DEFAULT_FILE_HISTORY_PAGE_SIZE,
  showCommitGraph: true,
};

export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>({ name: 'commitLog' });
  const [repositories, setRepositories] = useState<RepositoryInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<WorkbenchSettings>(DEFAULT_SETTINGS);
  const [repositoryId, setRepositoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);
  const loadedOnceRef = useRef(false);
  /**
   * Show in Git Log 요청마다 증가한다.
   * CommitLogPage의 key로 써서 같은 커밋을 다시 눌러도 화면이 새로 뜨게 한다.
   */
  const revealTokenRef = useRef(0);

  const showInCommitLog = useCallback((commitHash: string, repoId: string) => {
    revealTokenRef.current += 1;
    // 파일이 속한 저장소로 먼저 옮긴다. key가 바뀌며 CommitLogPage가 다시 만들어지므로
    // 엉뚱한 저장소에서 커밋을 찾다 빈 화면이 되는 일이 없다.
    setRepositoryId(repoId);
    setRoute({
      name: 'commitLog',
      revealHash: commitHash,
      revealToken: revealTokenRef.current,
    });
  }, []);

  const reloadRepositories = useCallback(async () => {
    // 전체 화면 loading은 첫 로드에서만 보여 준다.
    // 갱신 때마다 화면을 통째로 바꾸면 깜빡이는 것처럼 보인다.
    if (loadedOnceRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(undefined);

    try {
      // 첫 요청이 Extension Host에 "webview 준비됨" 신호가 된다.
      // 이 응답 전에 보낸 route 알림은 Extension Host가 큐에 보관했다가 흘려보낸다.
      await ping();

      const result = await listRepositories();
      setSettings(result.settings);

      // 갱신 도중 내장 Git이 잠깐 저장소를 0개로 보고하는 일이 있다.
      // 그대로 반영하면 화면 전체가 "저장소 없음"으로 바뀌었다 돌아오며 깜빡인다.
      // 한 번이라도 저장소를 본 뒤에는 빈 목록을 무시한다.
      if (result.repositories.length > 0 || !loadedOnceRef.current) {
        setRepositories(result.repositories);
        setRepositoryId(current =>
          result.repositories.some(repository => repository.id === current)
            ? current
            : (result.repositories[0]?.id ?? ''),
        );
      }
    } catch (caught) {
      if (!isSuperseded(caught)) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      loadedOnceRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reloadRepositories();
  }, [reloadRepositories]);

  useEffect(
    () =>
      onNotification(message => {
        switch (message.type) {
          case 'route/fileHistory':
            setRoute({
              name: 'fileHistory',
              uri: message.uri,
              fileName: message.fileName,
              repositoryName: message.repositoryName,
            });
            setRefreshToken(current => current + 1);
            break;

          case 'route/commitLog':
            setRoute({ name: 'commitLog' });
            break;

          case 'repositories/changed':
            void reloadRepositories();
            setRefreshToken(current => current + 1);
            break;

          case 'refresh':
            setRefreshToken(current => current + 1);
            break;

          default:
            break;
        }
      }),
    [reloadRepositories],
  );

  // 아래 세 화면은 첫 로드 전에만 전체를 차지한다.
  // 한 번 workbench를 그린 뒤에는 무슨 일이 있어도 통째로 교체하지 않는다.
  // 교체하면 화면 전체가 사라졌다 나타나며 깜빡인다.
  if (loading) {
    return <Loading label="저장소를 확인하는 중" />;
  }

  if (repositories.length === 0) {
    return (
      <ErrorState
        title={error ? '저장소 정보를 불러오지 못했습니다' : 'Git 저장소가 없습니다'}
        detail={
          error ?? 'Git 저장소가 포함된 폴더를 열면 이력을 조회할 수 있습니다.'
        }
        action={{ label: '다시 확인', onClick: () => void reloadRepositories() }}
      />
    );
  }

  return (
    <div className="app">
      <nav className="tab-bar" role="tablist" aria-label="Git Workbench 화면">
        <button
          type="button"
          role="tab"
          aria-selected={route.name === 'commitLog'}
          className={route.name === 'commitLog' ? 'tab active' : 'tab'}
          onClick={() => setRoute({ name: 'commitLog' })}
        >
          Git Log
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={route.name === 'fileHistory'}
          className={route.name === 'fileHistory' ? 'tab active' : 'tab'}
          disabled={route.name !== 'fileHistory'}
          title={
            route.name === 'fileHistory'
              ? route.fileName
              : '파일을 우클릭해 Show File History를 실행하세요.'
          }
        >
          File History
          {route.name === 'fileHistory' ? `: ${route.fileName}` : ''}
        </button>

        <div className="toolbar-spacer" />

        {refreshing ? (
          <span className="tab-status" role="status" aria-live="polite">
            <span className="spinner small" aria-hidden="true" />
            갱신 중
          </span>
        ) : null}

        {error ? (
          <span className="tab-status error" role="alert" title={error}>
            갱신 실패
            <button type="button" onClick={() => void reloadRepositories()}>
              다시 시도
            </button>
          </span>
        ) : null}
      </nav>

      <ErrorBoundary key={route.name}>
        {route.name === 'fileHistory' ? (
          <FileHistoryPage
            uri={route.uri}
            fileName={route.fileName}
            repositoryName={route.repositoryName}
            pageSize={settings.fileHistoryPageSize}
            refreshToken={refreshToken}
            onShowInCommitLog={showInCommitLog}
          />
        ) : (
          <CommitLogPage
            key={route.revealToken ?? 0}
            revealHash={route.revealHash}
            repositories={repositories}
            repositoryId={repositoryId}
            onSelectRepository={setRepositoryId}
            pageSize={settings.commitPageSize}
            showCommitGraph={settings.showCommitGraph}
            refreshToken={refreshToken}
          />
        )}
      </ErrorBoundary>
    </div>
  );
}
