import { describe, expect, it } from 'vitest';
import type { CommitSummary } from '../../src/shared/models';
import { computeGraph } from '../../webview/features/commitLog/commitGraph';

function commit(hash: string, ...parents: string[]): CommitSummary {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parentHashes: parents,
    authorName: 'tester',
    authorDate: '2024-01-01T00:00:00+00:00',
    subject: hash,
    decorations: [],
  };
}

describe('computeGraph', () => {
  it('일직선 이력은 lane 하나만 쓴다', () => {
    const graph = computeGraph([
      commit('c', 'b'),
      commit('b', 'a'),
      commit('a'),
    ]);

    expect(graph.laneCount).toBe(1);
    expect(graph.rows.map(row => row.lane)).toEqual([0, 0, 0]);
    expect(graph.rows[2].outgoing).toEqual([]);
  });

  it('merge는 두 번째 parent에 새 lane을 준다', () => {
    //   m (merge of a, b)
    //   ├ a
    //   │ b
    //   └ root
    const graph = computeGraph([
      commit('m', 'a', 'b'),
      commit('a', 'root'),
      commit('b', 'root'),
      commit('root'),
    ]);

    expect(graph.laneCount).toBe(2);
    expect(graph.rows[0].outgoing).toEqual([0, 1]);
    expect(graph.rows[1].lane).toBe(0);
    expect(graph.rows[2].lane).toBe(1);

    // root는 두 lane이 합류한다.
    expect(graph.rows[3].incoming).toEqual([0, 1]);
    expect(graph.rows[3].outgoing).toEqual([]);
  });

  it('분기하지 않는 lane은 통과 표시가 된다', () => {
    const graph = computeGraph([
      commit('m', 'a', 'b'),
      commit('a', 'root'),
      commit('x', 'y'), // 다른 갈래
      commit('b', 'root'),
      commit('root'),
      commit('y'),
    ]);

    // 'x' 행에서는 a→root, b lane이 지나간다.
    expect(graph.rows[2].passThrough.length).toBeGreaterThan(0);
  });

  it('lane이 끝나면 재사용한다', () => {
    const graph = computeGraph([
      commit('b', 'a'),
      commit('a'), // 여기서 lane 0이 끝난다
      commit('d', 'c'),
      commit('c'),
    ]);

    expect(graph.laneCount).toBe(1);
    expect(graph.rows.map(row => row.lane)).toEqual([0, 0, 0, 0]);
  });

  it('빈 목록도 처리한다', () => {
    const graph = computeGraph([]);

    expect(graph.rows).toEqual([]);
    expect(graph.laneCount).toBe(1);
  });
});
