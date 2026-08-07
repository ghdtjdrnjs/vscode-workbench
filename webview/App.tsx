import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_COMMIT_PAGE_SIZE,
  DEFAULT_FILE_HISTORY_PAGE_SIZE,
} from '../src/shared/constants';
import type { RepositoryInfo } from '../src/shared/models';
import type { WorkbenchSettings } from '../src/shared/protocol';
import { ErrorState, Loading } from './components/States';
import { listRepositories, ping } from './api';
import { CommitLogPage } from './features/commitLog/CommitLogPage';
import { FileHistoryPage } from './features/fileHistory/FileHistoryPage';
import { isSuperseded, onNotification } from './vscode';

type Route =
  | { name: 'commitLog' }
  | { name: 'fileHistory'; uri: string; fileName: string; repositoryName: string };

const DEFAULT_SETTINGS: WorkbenchSettings = {
  commitPageSize: DEFAULT_COMMIT_PAGE_SIZE,
  fileHistoryPageSize: DEFAULT_FILE_HISTORY_PAGE_SIZE,
  showCommitGraph: true,
};

export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>({ name: 'commitLog' });
  const [repositories, setRepositories] = useState<RepositoryInfo[]>([]);
  const [settings, setSettings] = useState<WorkbenchSettings>(DEFAULT_SETTINGS);
  const [repositoryId, setRepositoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);

  const reloadRepositories = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      // 첫 요청이 Extension Host에 "webview 준비됨" 신호가 된다.
      // 이 응답 전에 보낸 route 알림은 Extension Host가 큐에 보관했다가 흘려보낸다.
      await ping();

      const result = await listRepositories();
      setRepositories(result.repositories);
      setSettings(result.settings);
      setRepositoryId(current =>
        result.repositories.some(repository => repository.id === current)
          ? current
          : (result.repositories[0]?.id ?? ''),
      );
    } catch (caught) {
      if (!isSuperseded(caught)) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      setLoading(false);
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

  if (loading) {
    return <Loading label="저장소를 확인하는 중" />;
  }

  if (error) {
    return (
      <ErrorState
        title="저장소 정보를 불러오지 못했습니다"
        detail={error}
        action={{ label: '다시 시도', onClick: () => void reloadRepositories() }}
      />
    );
  }

  if (repositories.length === 0) {
    return (
      <ErrorState
        title="Git 저장소가 없습니다"
        detail="Git 저장소가 포함된 폴더를 열면 이력을 조회할 수 있습니다."
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
      </nav>

      {route.name === 'fileHistory' ? (
        <FileHistoryPage
          uri={route.uri}
          fileName={route.fileName}
          repositoryName={route.repositoryName}
          pageSize={settings.fileHistoryPageSize}
          refreshToken={refreshToken}
        />
      ) : (
        <CommitLogPage
          repositories={repositories}
          repositoryId={repositoryId}
          onSelectRepository={setRepositoryId}
          pageSize={settings.commitPageSize}
          showCommitGraph={settings.showCommitGraph}
          refreshToken={refreshToken}
        />
      )}
    </div>
  );
}
