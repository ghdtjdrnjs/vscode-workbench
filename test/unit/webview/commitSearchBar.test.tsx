// @vitest-environment jsdom
/**
 * 검색 입력 중 화면 전체가 사라지던 문제의 회귀 테스트.
 *
 * 증상: 검색어를 빠르게 치거나 한글을 입력하면 간헐적으로
 * "Cannot read properties of null (reading 'value')"로 화면이 죽었다.
 *
 * 원인: onChange에서 `setDraft(current => ({ ...current, message: event.currentTarget.value }))`처럼
 * event를 updater 안에서 읽었다. React는 이벤트 처리가 끝나면 currentTarget을 null로 되돌린다.
 * 대기 중인 업데이트가 있으면 updater가 즉시 실행되지 않고 다음 렌더에서 실행되므로
 * 그때는 currentTarget이 이미 null이다.
 *
 * 규칙: event 값은 updater 밖에서 먼저 꺼낸다.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommitSearchBar } from '../../../webview/features/commitLog/CommitSearchBar';

afterEach(cleanup);

describe('CommitSearchBar', () => {
  it.each([
    ['커밋 메시지 또는 hash 검색', 'a', 'ab'],
    ['작성자 검색', 'a', 'ab'],
    ['시작 날짜', '2024-01-01', '2024-01-02'],
    ['종료 날짜', '2024-01-01', '2024-01-02'],
  ])('%s: 한 번에 여러 입력이 몰려도 오류 없이 마지막 값을 반영한다', (label, first, second) => {
    render(
      <CommitSearchBar
        filters={{ allRefs: true }}
        loadedCount={0}
        hasMore={false}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(label) as HTMLInputElement;

    // 같은 렌더 사이클 안에 두 번째 업데이트가 들어오면 updater가 렌더 시점으로 미뤄진다.
    act(() => {
      fireEvent.change(input, { target: { value: first } });
      fireEvent.change(input, { target: { value: second } });
    });

    expect(input.value).toBe(second);
  });
});
