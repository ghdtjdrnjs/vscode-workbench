/**
 * 분할 영역 크기 계산. VS Code API에 의존하지 않는 순수 로직이다.
 */

/**
 * 모든 분할 영역이 공통으로 쓰는 최소 크기(px).
 * 비율이 아니라 px로 두어야 패널 크기나 로드된 내용과 무관하게 항상 같다.
 */
export const MIN_PANE_SIZE = 80;

/**
 * 드래그 비율을 허용 범위 안으로 자른다.
 *
 * 양쪽 모두 minSize 이상을 갖도록 한다. 컨테이너가 너무 작아 둘 다 만족할 수
 * 없으면 반씩 나눈다. 컨텐츠 크기는 보지 않는다. 컨텐츠에 따라 한계가 달라지면
 * 같은 위치에서 어떤 때는 움직이고 어떤 때는 안 움직이는 것처럼 보인다.
 */
export function clampRatio(
  ratio: number,
  total: number,
  minSize: number = MIN_PANE_SIZE,
): number {
  if (!Number.isFinite(ratio)) {
    return 0.5;
  }

  if (!Number.isFinite(total) || total <= 0) {
    return Math.min(1, Math.max(0, ratio));
  }

  if (total < minSize * 2) {
    return 0.5;
  }

  const min = minSize / total;
  const max = 1 - min;

  return Math.min(max, Math.max(min, ratio));
}

/**
 * 드래그 이동량으로 새 비율을 만든다.
 *
 * 마우스의 절대 위치로 비율을 다시 계산하면, 손잡이를 잡은 지점과 계산된 위치가
 * 조금이라도 어긋날 때 첫 이동에서 선이 그 차이만큼 순간이동한다.
 * 잡은 순간의 비율에 이동량만 더하면 선이 마우스를 정확히 따라간다.
 */
export function ratioFromDrag(
  startRatio: number,
  deltaPx: number,
  total: number,
  minSize: number = MIN_PANE_SIZE,
): number {
  if (!Number.isFinite(total) || total <= 0) {
    return startRatio;
  }

  return clampRatio(startRatio + deltaPx / total, total, minSize);
}
