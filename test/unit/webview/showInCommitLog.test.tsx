// @vitest-environment jsdom
/**
 * File History 컨텍스트 메뉴(Cherry-Pick / Show in Git Log) 동작 테스트.
 *
 * 특히 Show in Git Log는 저장소를 잘못 고르기 쉽다.
 * FileHistoryPage의 저장소는 "그 파일이 속한 저장소"지만,
 * CommitLogPage의 저장소는 "위쪽 드롭다운이 가리키는 저장소"라서 서로 다를 수 있다.
 * 다르면 엉뚱한 저장소에서 커밋을 찾다 빈 화면이 된다.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CommitSummary,
  FileHistoryResult,
  RepositoryInfo,
} from '../../../src/shared/models';
import type { ExtensionNotification } from '../../../src/shared/protocol';

const loadCommitLog = vi.fn();
const loadCommitDetail = vi.fn();
const loadFileHistory = vi.fn();
const cherryPick = vi.fn();
let notify: ((message: ExtensionNotification) => void) | undefined;

vi.mock('../../../webview/api', () => ({
  ping: async () => undefined,
  listRepositories: async () => ({
    repositories: REPOS,
    settings: {
      commitPageSize: 200,
      fileHistoryPageSize: 100,
      showCommitGraph: false,
    },
  }),
  loadCommitLog: (...args: unknown[]) => loadCommitLog(...args),
  loadCommitDetail: (...args: unknown[]) => loadCommitDetail(...args),
  loadFileHistory: (...args: unknown[]) => loadFileHistory(...args),
  loadRefs: async () => [],
  loadDiff: async () => undefined,
  cherryPick: (...args: unknown[]) => cherryPick(...args),
  openDiffInEditor: vi.fn(),
}));

vi.mock('../../../webview/vscode', () => ({
  isSuperseded: () => false,
  reportError: () => undefined,
  requestReload: () => undefined,
  getUiFlag: (_key: string, fallback: boolean) => fallback,
  setUiFlag: () => undefined,
  getSplitRatio: (_key: string, fallback: number) => fallback,
  setSplitRatio: () => undefined,
  onNotification: (listener: (message: ExtensionNotification) => void) => {
    notify = listener;
    return () => {
      notify = undefined;
    };
  },
}));

import { App } from '../../../webview/App';
import { CommitLogPage } from '../../../webview/features/commitLog/CommitLogPage';

/** 드롭다운 기본값은 repoA다. 아래 파일은 repoB에 있다. */
const REPOS: RepositoryInfo[] = [
  { id: 'repoA', rootUri: 'file:///a', name: 'a' },
  { id: 'repoB', rootUri: 'file:///b', name: 'b' },
];

const HASH = '7777777777777777777777777777777777777777';
const HASH_FAR = '9999999999999999999999999999999999999999';

function commit(hash: string, subject: string): CommitSummary {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parentHashes: [],
    authorName: '홍길동',
    authorDate: '2024-01-01T00:00:00+09:00',
    subject,
    decorations: [],
  };
}

const HISTORY: FileHistoryResult = {
  repository: REPOS[1],
  requestedUri: 'file:///b/src/x.ts',
  relativePath: 'src/x.ts',
  entries: [
    { ...commit(HASH, 'in repo B'), status: 'M', pathAtCommit: 'src/x.ts' },
  ],
  hasMore: false,
};

/** 편집기 우클릭 → Show File History와 같은 경로로 File History 화면을 연다. */
async function openFileHistory(): Promise<void> {
  render(<App />);
  await waitFor(() => expect(screen.getByRole('tablist')).toBeTruthy());

  notify?.({
    type: 'route/fileHistory',
    uri: 'file:///b/src/x.ts',
    fileName: 'x.ts',
    repositoryName: 'b',
  });

  await waitFor(() => expect(screen.getByTitle('in repo B')).toBeTruthy());
}

beforeEach(() => {
  notify = undefined;
  loadFileHistory.mockReset().mockResolvedValue(HISTORY);
  loadCommitDetail.mockReset().mockResolvedValue(undefined);
  cherryPick.mockReset().mockResolvedValue({ status: 'applied', message: 'ok' });
  loadCommitLog.mockReset().mockResolvedValue({ commits: [], hasMore: false });
});

afterEach(() => {
  cleanup();
});

describe('File History 컨텍스트 메뉴', () => {
  it('커밋을 우클릭하면 Cherry-Pick과 Show in Git Log가 뜬다', async () => {
    await openFileHistory();
    fireEvent.contextMenu(screen.getByTitle('in repo B'));

    expect(screen.getByRole('menuitem', { name: /Cherry-Pick/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Show in Git Log' })).toBeTruthy();
  });

  it('Cherry-Pick은 그 파일의 저장소와 커밋으로 요청한다', async () => {
    await openFileHistory();
    fireEvent.contextMenu(screen.getByTitle('in repo B'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Cherry-Pick/ }));

    await waitFor(() =>
      expect(cherryPick).toHaveBeenCalledWith({
        repositoryId: 'repoB',
        commitHash: HASH,
      }),
    );
  });

  it('Show in Git Log는 드롭다운이 아니라 그 파일의 저장소를 조회한다', async () => {
    await openFileHistory();

    loadCommitLog.mockClear();
    fireEvent.contextMenu(screen.getByTitle('in repo B'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show in Git Log' }));

    await waitFor(() => expect(loadCommitLog).toHaveBeenCalled());

    // 여기서 repoA가 섞이면 커밋을 찾지 못해 빈 목록이 뜬다.
    for (const call of loadCommitLog.mock.calls) {
      expect(call[0].repositoryId).toBe('repoB');
    }
  });
});

const LOG_PROPS = {
  repositories: REPOS,
  repositoryId: 'repoB',
  onSelectRepository: vi.fn(),
  pageSize: 200,
  showCommitGraph: false,
  refreshToken: 0,
};

describe('Git Log의 reveal', () => {
  it('첫 페이지에 있으면 그 커밋을 고른다', async () => {
    loadCommitLog.mockResolvedValue({
      commits: [commit(HASH, 'first'), commit(HASH_FAR, 'second')],
      hasMore: false,
    });

    render(<CommitLogPage {...LOG_PROPS} revealHash={HASH_FAR} />);

    await waitFor(() =>
      expect(loadCommitDetail).toHaveBeenCalledWith(
        expect.objectContaining({ commitHash: HASH_FAR }),
      ),
    );
  });

  it('첫 페이지 밖이면 hash를 검색어에 넣어 다시 찾는다', async () => {
    loadCommitLog.mockImplementation(
      async (input: { filters: { message?: string } }) =>
        input.filters.message === HASH_FAR
          ? { commits: [commit(HASH_FAR, 'far')], hasMore: false }
          : { commits: [commit(HASH, 'first')], hasMore: false },
    );

    render(<CommitLogPage {...LOG_PROPS} revealHash={HASH_FAR} />);

    await waitFor(() =>
      expect(loadCommitDetail).toHaveBeenCalledWith(
        expect.objectContaining({ commitHash: HASH_FAR }),
      ),
    );
  });
});
