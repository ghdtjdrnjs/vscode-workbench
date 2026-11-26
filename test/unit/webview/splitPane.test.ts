/**
 * 분할 영역 크기 제한 회귀 테스트.
 *
 * 증상: 영역을 줄이려고 divider를 끌면 갑자기 왼쪽으로 튀었다가
 * 오른쪽으로는 더 이상 가지 않았다. 한계가 로드된 내용에 따라 달라졌다.
 *
 * 규칙: 한계는 px 하나로 고정한다. 컨테이너 크기와 컨텐츠는 보지 않는다.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_PANE_SIZE,
  clampRatio,
  ratioFromDrag,
} from '../../../webview/components/splitRatio';

const TOTAL = 1000;

describe('clampRatio', () => {
  it('범위 안의 값은 그대로 둔다', () => {
    expect(clampRatio(0.5, TOTAL)).toBe(0.5);
    expect(clampRatio(0.3, TOTAL)).toBe(0.3);
  });

  it('양쪽 모두 최소 크기를 확보한다', () => {
    const min = MIN_PANE_SIZE / TOTAL;

    expect(clampRatio(0, TOTAL)).toBeCloseTo(min, 6);
    expect(clampRatio(1, TOTAL)).toBeCloseTo(1 - min, 6);
  });

  it('최소 크기는 px 기준이라 컨테이너가 커도 같은 값이다', () => {
    // 비율 기준이었다면 컨테이너가 커질수록 최소 폭도 같이 커졌다.
    for (const total of [400, 1000, 2400]) {
      const smallest = clampRatio(0, total) * total;
      expect(Math.round(smallest)).toBe(MIN_PANE_SIZE);
    }
  });

  it('한쪽을 최소까지 줄일 수 있다', () => {
    const ratio = clampRatio(0.99, TOTAL);

    // 오른쪽에 딱 최소 크기만 남는다.
    expect(Math.round((1 - ratio) * TOTAL)).toBe(MIN_PANE_SIZE);
  });

  it('컨테이너가 최소 크기 두 배보다 작으면 반씩 나눈다', () => {
    expect(clampRatio(0.9, MIN_PANE_SIZE * 2 - 1)).toBe(0.5);
    expect(clampRatio(0.1, 100)).toBe(0.5);
  });

  it('크기를 아직 모를 때도 값을 망가뜨리지 않는다', () => {
    // 첫 렌더에서는 getBoundingClientRect가 0을 준다.
    expect(clampRatio(0.56, 0)).toBe(0.56);
    expect(clampRatio(1.5, 0)).toBe(1);
    expect(clampRatio(-0.2, 0)).toBe(0);
  });

  it('숫자가 아니면 기본값으로 되돌린다', () => {
    expect(clampRatio(Number.NaN, TOTAL)).toBe(0.5);
  });

  it('최소 크기를 직접 줄 수도 있다', () => {
    expect(Math.round(clampRatio(0, TOTAL, 50) * TOTAL)).toBe(50);
  });

  it('공통 최소 크기는 작게 잡혀 있다', () => {
    // 좁은 하단 패널에서도 세 영역을 모두 볼 수 있어야 한다.
    expect(MIN_PANE_SIZE).toBeLessThanOrEqual(100);
  });
});

describe('ratioFromDrag', () => {
  const TOTAL_PX = 1000;

  it('잡은 순간에는 위치가 전혀 움직이지 않는다', () => {
    // mousedown 직후 delta 0. 여기서 값이 바뀌면 선이 순간이동한다.
    for (const start of [0.2, 0.35, 0.5, 0.78]) {
      expect(ratioFromDrag(start, 0, TOTAL_PX)).toBe(start);
    }
  });

  it('이동한 px만큼만 정확히 따라간다', () => {
    expect(ratioFromDrag(0.5, 100, TOTAL_PX)).toBeCloseTo(0.6, 6);
    expect(ratioFromDrag(0.5, -100, TOTAL_PX)).toBeCloseTo(0.4, 6);
  });

  it('여러 번 나눠 움직여도 한 번에 움직인 것과 같다', () => {
    const once = ratioFromDrag(0.4, 150, TOTAL_PX);
    // 실제 드래그는 매번 origin 기준으로 계산하므로 누적 delta와 같아야 한다.
    const stepwise = ratioFromDrag(0.4, 50 + 50 + 50, TOTAL_PX);

    expect(stepwise).toBeCloseTo(once, 10);
  });

  it('끝까지 밀어도 최소 크기에서 멈춘다', () => {
    const ratio = ratioFromDrag(0.5, 10_000, TOTAL_PX);

    expect(Math.round((1 - ratio) * TOTAL_PX)).toBe(MIN_PANE_SIZE);
  });

  it('크기를 모를 때는 값을 바꾸지 않는다', () => {
    expect(ratioFromDrag(0.42, 300, 0)).toBe(0.42);
  });
});
