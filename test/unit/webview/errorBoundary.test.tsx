// @vitest-environment jsdom
/**
 * 렌더 오류 복구 테스트.
 *
 * 증상: 검색 중 화면 전체가 빈 화면이 되고, 창을 다시 로드하기 전에는 돌아오지 않았다.
 *
 * 원인: Error Boundary가 없어 한 컴포넌트의 렌더 예외가 React 트리 전체를 언마운트했다.
 *
 * 규칙: 오류는 경계 안쪽만 대체하고, 원인을 Extension Host에 보고하며, 복구 버튼을 준다.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportError = vi.fn();
const requestReload = vi.fn();

vi.mock('../../../webview/vscode', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
  requestReload: () => requestReload(),
}));

import { ErrorBoundary } from '../../../webview/components/ErrorBoundary';

let shouldThrow = true;
let mounts = 0;

function Flaky(): JSX.Element {
  mounts += 1;

  if (shouldThrow) {
    throw new Error('boom');
  }

  return <div>정상 화면</div>;
}

beforeEach(() => {
  shouldThrow = true;
  mounts = 0;
  reportError.mockReset();
  requestReload.mockReset();
  // React가 잡은 오류를 콘솔에 다시 찍는다. 테스트 출력만 조용히 한다.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('렌더 오류가 나면 경계 밖은 남기고 안쪽만 오류 화면으로 바꾼다', () => {
    render(
      <div>
        <nav>탭 바</nav>
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>
      </div>,
    );

    expect(screen.getByText('탭 바')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('boom');
  });

  it('오류와 component stack을 Extension Host에 보고한다', () => {
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );

    expect(reportError).toHaveBeenCalledTimes(1);
    const [error, componentStack] = reportError.mock.calls[0];
    expect((error as Error).message).toBe('boom');
    expect(componentStack).toContain('Flaky');
  });

  it('다시 시도하면 children을 새로 마운트한다', () => {
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    const before = mounts;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(screen.getByText('정상 화면')).toBeTruthy();
    expect(mounts).toBeGreaterThan(before);
  });

  it('화면 새로고침은 Extension Host에 reload를 요청한다', () => {
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: '화면 새로고침' }));

    expect(requestReload).toHaveBeenCalledTimes(1);
  });
});
