import type { CommitSummary } from '../../../src/shared/models';

export interface GraphRow {
  /** 이 커밋이 놓인 lane. */
  lane: number;
  /** 위에서 내려와 이 커밋으로 합류하는 lane들. */
  incoming: number[];
  /** 이 행을 그대로 통과하는 lane들. */
  passThrough: number[];
  /** 이 커밋에서 아래로 이어지는 lane들(parent 순서). */
  outgoing: number[];
}

export interface GraphModel {
  rows: GraphRow[];
  laneCount: number;
}

/**
 * parent hash만으로 만드는 최소 lane 모델.
 * IntelliJ의 lane 배치를 그대로 재현하지 않고, 분기·병합·종료만 이어지게 한다.
 */
export function computeGraph(commits: readonly CommitSummary[]): GraphModel {
  const lanes: (string | undefined)[] = [];
  const rows: GraphRow[] = [];
  let laneCount = 0;

  for (const commit of commits) {
    const incoming: number[] = [];

    for (let index = 0; index < lanes.length; index += 1) {
      if (lanes[index] === commit.hash) {
        incoming.push(index);
      }
    }

    const lane = incoming.length > 0 ? incoming[0] : allocate(lanes);

    // 같은 커밋을 기다리던 나머지 lane은 여기서 끝난다.
    for (const extra of incoming.slice(1)) {
      lanes[extra] = undefined;
    }

    lanes[lane] = commit.hash;

    const passThrough: number[] = [];

    for (let index = 0; index < lanes.length; index += 1) {
      if (
        lanes[index] !== undefined &&
        index !== lane &&
        !incoming.includes(index)
      ) {
        passThrough.push(index);
      }
    }

    const outgoing: number[] = [];

    if (commit.parentHashes.length === 0) {
      lanes[lane] = undefined;
    } else {
      lanes[lane] = commit.parentHashes[0];
      outgoing.push(lane);

      for (const parent of commit.parentHashes.slice(1)) {
        const existing = lanes.indexOf(parent);
        const target = existing >= 0 ? existing : allocate(lanes);
        lanes[target] = parent;
        outgoing.push(target);
      }
    }

    trimTail(lanes);
    laneCount = Math.max(laneCount, lanes.length, lane + 1);

    rows.push({ lane, incoming, passThrough, outgoing });
  }

  return { rows, laneCount: Math.max(1, laneCount) };
}

function allocate(lanes: (string | undefined)[]): number {
  const free = lanes.indexOf(undefined);

  if (free >= 0) {
    return free;
  }

  lanes.push(undefined);
  return lanes.length - 1;
}

function trimTail(lanes: (string | undefined)[]): void {
  while (lanes.length > 0 && lanes[lanes.length - 1] === undefined) {
    lanes.pop();
  }
}
