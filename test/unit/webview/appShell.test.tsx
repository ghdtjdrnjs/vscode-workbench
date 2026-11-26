// @vitest-environment jsdom
/**
 * 전체 화면 깜빡임 회귀 테스트.
 *
 * 증상: 갱신 주기마다 화면 전체가 사라졌다 돌아왔다.
 *
 * 원인: App이 `error`나 `repositories.length === 0`일 때 트리 전체를 다른 화면으로
 * 교체했다. 갱신 도중 내장 Git이 잠깐 저장소를 0개로 보고하거나 요청이 한 번
 * 실패하면 workbench 전체가 언마운트됐다가 다시 마운트됐다.
 *
 * 규칙: 한 번 workbench를 그린 뒤에는 무슨 일이 있어도 통째로 교체하지 않는다.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryInfo } from '../../../src/shared/models';
import type { ExtensionNotification } from '../../../src/shared/protocol';

const listRepositories = vi.fn();
const ping = vi.fn();
let notify: ((message: ExtensionNotification) => void) | undefined;

vi.mock('../../../webview/api', () => ({
  listRepositories: () => listRepositories(),
  ping: () => ping(),
  loadCommitLog: async () => ({ commits: [], hasMore: false }),
  loadCommitDetail: async () => undefined,
  loadRefs: async () => [],
  loadDiff: async () => undefined,
  loadFileHistory: async () => ({
    repository: { id: 'repo1', rootUri: 'file:///r', name: 'r' },
    requestedUri: '',
    relativePath: '',
    entries: [],
    hasMore: false,
  }),
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
  onNotification: (listener: (message: ExtensionNotification) => void) => {
    notify = listener;
    return () => {
      notify = undefined;
    };
  },
}));

import { App } from '../../../webview/App';

const REPOS: RepositoryInfo[] = [
  { id: 'repo1', rootUri: 'file:///r', name: 'my-repo' },
];

const SETTINGS = {
  commitPageSize: 200,
  fileHistoryPageSize: 100,
  showCommitGraph: false,
};

/** workbench 본체가 화면에 있는지. 탭 바가 그 기준이다. */
function workbenchVisible(): boolean {
  return screen.queryByRole('tablist', { name: 'Git Workbench 화면' }) !== null;
}

beforeEach(() => {
  notify = undefined;
  ping.mockReset().mockResolvedValue(undefined);
  listRepositories
    .mockReset()
    .mockResolvedValue({ repositories: REPOS, settings: SETTINGS });
});

afterEach(() => {
  cleanup();
});

describe('App 전체 화면 유지', () => {
  it('갱신이 저장소를 0개로 보고해도 화면을 유지한다', async () => {
    render(<App />);
    await waitFor(() => expect(workbenchVisible()).toBe(true));

    // 내장 Git이 index 갱신 중 잠깐 저장소를 못 찾는 상황.
    listRepositories.mockResolvedValueOnce({
      repositories: [],
      settings: SETTINGS,
    });

    notify?.({ type: 'repositories/changed' });

    await waitFor(() => expect(listRepositories).toHaveBeenCalledTimes(2));

    // 여기서 false가 되면 화면 전체가 사라졌다 돌아오며 깜빡인다.
    expect(workbenchVisible()).toBe(true);
    expect(screen.queryByText('Git 저장소가 없습니다')).toBeNull();
  });

  it('갱신이 실패해도 화면을 유지하고 배너로만 알린다', async () => {
    render(<App />);
    await waitFor(() => expect(workbenchVisible()).toBe(true));

    listRepositories.mockRejectedValueOnce(new Error('git 실행 실패'));

    notify?.({ type: 'repositories/changed' });

    await waitFor(() => expect(listRepositories).toHaveBeenCalledTimes(2));

    expect(workbenchVisible()).toBe(true);
    // 전체 화면 대신 작은 상태 표시로만 알린다.
    await screen.findByText('갱신 실패');
    expect(
      screen.queryByText('저장소 정보를 불러오지 못했습니다'),
    ).toBeNull();
  });

  it('첫 로드에서 저장소가 없으면 안내 화면을 보여 준다', async () => {
    listRepositories.mockResolvedValue({
      repositories: [],
      settings: SETTINGS,
    });

    render(<App />);

    await screen.findByText('Git 저장소가 없습니다');
    expect(workbenchVisible()).toBe(false);
  });

  it('첫 로드가 실패하면 오류 화면을 보여 준다', async () => {
    listRepositories.mockRejectedValue(new Error('git executable 없음'));

    render(<App />);

    await screen.findByText('저장소 정보를 불러오지 못했습니다');
    expect(workbenchVisible()).toBe(false);
  });

  it('갱신이 끝나면 실패 배너가 사라진다', async () => {
    render(<App />);
    await waitFor(() => expect(workbenchVisible()).toBe(true));

    listRepositories.mockRejectedValueOnce(new Error('일시적 실패'));
    notify?.({ type: 'repositories/changed' });
    await screen.findByText('갱신 실패');

    notify?.({ type: 'repositories/changed' });

    await waitFor(() =>
      expect(screen.queryByText('갱신 실패')).toBeNull(),
    );
    expect(workbenchVisible()).toBe(true);
  });
});
