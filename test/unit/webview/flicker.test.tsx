// @vitest-environment jsdom
/**
 * 깜빡임 회귀 테스트.
 *
 * 증상: 저장소 상태가 바뀌면 webview가 목록을 다시 읽는데, 커밋 내용이 그대로여도
 * 오른쪽 상세/diff 영역이 Loading으로 덮였다가 돌아왔다.
 *
 * 원인: `commits[selectedIndex]`는 객체다. 목록을 다시 읽으면 내용이 같아도
 * 새 객체가 만들어지고, 이 객체에 의존하던 effect가 매번 다시 실행됐다.
 *
 * 이 테스트는 화면을 눈으로 보지 않고 그 메커니즘을 직접 확인한다.
 * 같은 데이터로 갱신했을 때 상세/diff를 다시 읽지 않아야 한다.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CommitDetail,
  CommitSummary,
  DiffModel,
  FileHistoryResult,
} from '../../../src/shared/models';

const loadCommitLog = vi.fn();
const loadCommitDetail = vi.fn();
const loadRefs = vi.fn();
const loadDiff = vi.fn();
const loadFileHistory = vi.fn();

vi.mock('../../../webview/api', () => ({
  loadCommitLog: (...args: unknown[]) => loadCommitLog(...args),
  loadCommitDetail: (...args: unknown[]) => loadCommitDetail(...args),
  loadRefs: (...args: unknown[]) => loadRefs(...args),
  loadDiff: (...args: unknown[]) => loadDiff(...args),
  loadFileHistory: (...args: unknown[]) => loadFileHistory(...args),
  cherryPick: vi.fn(),
}));

vi.mock('../../../webview/vscode', () => ({
  isSuperseded: () => false,
  reportError: () => undefined,
  requestReload: () => undefined,
  getUiFlag: (_key: string, fallback: boolean) => fallback,
  setUiFlag: () => undefined,
  getSplitRatio: (_key: string, fallback: number) => fallback,
  setSplitRatio: () => undefined,
}));

// vi.mock은 호이스팅되므로 아래 정적 import도 mock을 받는다.
import { CommitLogPage } from '../../../webview/features/commitLog/CommitLogPage';
import { FileHistoryPage } from '../../../webview/features/fileHistory/FileHistoryPage';

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

const COMMITS = [
  commit('1111111111111111111111111111111111111111', 'first'),
  commit('2222222222222222222222222222222222222222', 'second'),
];

function detailOf(hash: string): CommitDetail {
  return {
    ...commit(hash, 'first'),
    parentIndex: 0,
    containingBranches: [],
    changedFiles: [{ status: 'M', newPath: 'src/a.ts' }],
  };
}

/** 매번 새 객체를 만들어 실제 postMessage 왕복과 같은 조건을 만든다. */
function freshPage() {
  return {
    commits: COMMITS.map(c => ({ ...c })),
    hasMore: false,
    nextCursor: undefined,
  };
}

/** 커밋 목록 안에서만 찾는다. 같은 제목이 상세 영역에도 나오기 때문이다. */
function listHas(subject: string): boolean {
  const list = screen.queryByRole('listbox', { name: '커밋 목록' });
  return list ? within(list).queryAllByText(subject).length > 0 : false;
}

function historyListHas(subject: string): boolean {
  const list = screen.queryByRole('listbox', { name: '파일 수정 이력' });
  return list ? within(list).queryAllByText(subject).length > 0 : false;
}

const LOG_PROPS = {
  repositories: [{ id: 'repo1', rootUri: 'file:///r', name: 'r' }],
  repositoryId: 'repo1',
  onSelectRepository: () => undefined,
  pageSize: 200,
  showCommitGraph: false,
};

beforeEach(() => {
  loadCommitLog.mockReset().mockImplementation(async () => freshPage());
  loadCommitDetail
    .mockReset()
    .mockImplementation(async () => detailOf(COMMITS[0].hash));
  loadRefs.mockReset().mockResolvedValue([]);
  loadDiff.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('Git Log 갱신 시 깜빡임', () => {
  it('같은 커밋 목록으로 갱신하면 상세를 다시 읽지 않는다', async () => {
    const view = render(<CommitLogPage {...LOG_PROPS} refreshToken={0} />);

    await waitFor(() => expect(loadCommitDetail).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listHas('first')).toBe(true));

    // repositories/changed 알림이 온 것과 같은 상황.
    view.rerender(<CommitLogPage {...LOG_PROPS} refreshToken={1} />);

    await waitFor(() => expect(loadCommitLog).toHaveBeenCalledTimes(2));

    // 목록은 다시 읽었지만 커밋이 그대로이므로 상세는 그대로여야 한다.
    // 여기서 2가 되면 오른쪽 영역이 Loading으로 덮이며 깜빡인다.
    expect(loadCommitDetail).toHaveBeenCalledTimes(1);
  });

  it('갱신 중에도 커밋 목록이 화면에서 사라지지 않는다', async () => {
    const view = render(<CommitLogPage {...LOG_PROPS} refreshToken={0} />);
    await waitFor(() => expect(listHas('first')).toBe(true));

    // 다음 응답을 붙잡아 두고 갱신 중 상태를 만든다.
    let release: (() => void) | undefined;
    loadCommitLog.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve(freshPage());
        }),
    );

    view.rerender(<CommitLogPage {...LOG_PROPS} refreshToken={1} />);

    // 응답을 받기 전에도 이전 목록이 남아 있어야 한다.
    expect(listHas('first')).toBe(true);

    release?.();
    await waitFor(() => expect(loadCommitLog).toHaveBeenCalledTimes(2));
    expect(listHas('first')).toBe(true);
  });

  it('새 커밋이 위에 추가돼도 선택한 커밋과 상세를 유지한다', async () => {
    const view = render(<CommitLogPage {...LOG_PROPS} refreshToken={0} />);
    await waitFor(() => expect(loadCommitDetail).toHaveBeenCalledTimes(1));

    const newCommit = commit(
      '3333333333333333333333333333333333333333',
      'third',
    );
    loadCommitLog.mockImplementation(async () => ({
      commits: [newCommit, ...COMMITS.map(c => ({ ...c }))],
      hasMore: false,
      nextCursor: undefined,
    }));

    view.rerender(<CommitLogPage {...LOG_PROPS} refreshToken={1} />);

    await waitFor(() => expect(listHas('third')).toBe(true));

    // 고르고 있던 커밋이 그대로 있으므로 상세를 다시 읽지 않는다.
    expect(loadCommitDetail).toHaveBeenCalledTimes(1);
  });

  it('선택한 커밋이 목록에서 사라지면 상세를 다시 읽는다', async () => {
    const view = render(<CommitLogPage {...LOG_PROPS} refreshToken={0} />);
    await waitFor(() => expect(loadCommitDetail).toHaveBeenCalledTimes(1));

    // 브랜치를 바꾼 것처럼 완전히 다른 커밋 집합이 온다.
    loadCommitLog.mockImplementation(async () => ({
      commits: [commit('4444444444444444444444444444444444444444', 'other')],
      hasMore: false,
      nextCursor: undefined,
    }));

    view.rerender(<CommitLogPage {...LOG_PROPS} refreshToken={1} />);

    await waitFor(() => expect(loadCommitDetail).toHaveBeenCalledTimes(2));
  });

  it('저장소를 바꾸면 이전 저장소의 커밋이 남지 않는다', async () => {
    const view = render(<CommitLogPage {...LOG_PROPS} refreshToken={0} />);
    await waitFor(() => expect(listHas('first')).toBe(true));

    let release: (() => void) | undefined;
    loadCommitLog.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve({ commits: [], hasMore: false });
        }),
    );

    view.rerender(
      <CommitLogPage {...LOG_PROPS} repositoryId="repo2" refreshToken={0} />,
    );

    // 옛 저장소의 커밋이 그대로 보이면 새 저장소에 옛 hash로 조회가 나간다.
    expect(listHas('first')).toBe(false);

    release?.();
    await waitFor(() => expect(loadCommitLog).toHaveBeenCalledTimes(2));
  });
});

describe('File History 갱신 시 깜빡임', () => {
  const HISTORY: FileHistoryResult = {
    repository: { id: 'repo1', rootUri: 'file:///r', name: 'r' },
    requestedUri: 'file:///r/src/a.ts',
    relativePath: 'src/a.ts',
    entries: [
      { ...commit('1111111111111111111111111111111111111111', 'first'), pathAtCommit: 'src/a.ts' },
      { ...commit('2222222222222222222222222222222222222222', 'second'), pathAtCommit: 'src/a.ts' },
    ],
    hasMore: false,
  };

  const FILE_PROPS = {
    uri: 'file:///r/src/a.ts',
    fileName: 'a.ts',
    repositoryName: 'r',
    pageSize: 100,
    onShowInCommitLog: () => undefined,
  };

  beforeEach(() => {
    loadFileHistory.mockReset().mockImplementation(async () => ({
      ...HISTORY,
      entries: HISTORY.entries.map(e => ({ ...e })),
    }));
    loadDiff.mockReset().mockResolvedValue({
      repositoryId: 'repo1',
      commitHash: HISTORY.entries[0].hash,
      parentIndex: 0,
      oldFile: { exists: true },
      newFile: { exists: true },
      status: 'M',
      hunks: [],
      binary: false,
      truncated: false,
      fullViewAvailable: true,
    } satisfies DiffModel);
  });

  it('같은 이력으로 갱신하면 diff를 다시 읽지 않는다', async () => {
    const view = render(<FileHistoryPage {...FILE_PROPS} refreshToken={0} />);

    await waitFor(() => expect(loadDiff).toHaveBeenCalledTimes(1));

    view.rerender(<FileHistoryPage {...FILE_PROPS} refreshToken={1} />);

    await waitFor(() => expect(loadFileHistory).toHaveBeenCalledTimes(2));

    // 여기서 2가 되면 diff 영역이 Loading으로 덮이며 깜빡인다.
    expect(loadDiff).toHaveBeenCalledTimes(1);
  });

  it('다른 파일로 바뀌면 이전 파일의 이력이 남지 않는다', async () => {
    const view = render(<FileHistoryPage {...FILE_PROPS} refreshToken={0} />);
    await waitFor(() => expect(historyListHas('first')).toBe(true));

    let release: (() => void) | undefined;
    loadFileHistory.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () =>
            resolve({ ...HISTORY, relativePath: 'src/b.ts', entries: [] });
        }),
    );

    view.rerender(
      <FileHistoryPage
        {...FILE_PROPS}
        uri="file:///r/src/b.ts"
        fileName="b.ts"
        refreshToken={0}
      />,
    );

    expect(historyListHas('first')).toBe(false);

    release?.();
    await waitFor(() => expect(loadFileHistory).toHaveBeenCalledTimes(2));
  });
});
