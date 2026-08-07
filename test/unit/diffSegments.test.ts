import { describe, expect, it } from 'vitest';
import {
  buildDiffSegments,
  expandCollapsed,
  splitLines,
} from '../../src/shared/diffSegments';
import type { DiffHunk } from '../../src/shared/models';

function line(text: string, oldNo: number, newNo: number) {
  return {
    type: 'context' as const,
    content: text,
    oldLineNumber: oldNo,
    newLineNumber: newNo,
  };
}

/** 30줄짜리 파일에서 15번째 줄만 바뀐 hunk. */
function hunkAt15(): DiffHunk {
  return {
    header: '@@ -12,7 +12,7 @@',
    oldStart: 12,
    oldLines: 7,
    newStart: 12,
    newLines: 7,
    lines: [
      line('line12', 12, 12),
      line('line13', 13, 13),
      line('line14', 14, 14),
      { type: 'delete', content: 'old15', oldLineNumber: 15 },
      { type: 'add', content: 'new15', newLineNumber: 15 },
      line('line16', 16, 16),
      line('line17', 17, 17),
      line('line18', 18, 18),
    ],
  };
}

const text = (count: number, marker = 'line'): string =>
  Array.from({ length: count }, (_, index) => `${marker}${index + 1}`).join('\n') +
  '\n';

describe('splitLines', () => {
  it('끝 개행이 만드는 빈 줄을 만들지 않는다', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
    expect(splitLines('')).toEqual([]);
  });
});

describe('buildDiffSegments', () => {
  it('큰 unchanged 구간은 접고 hunk는 그대로 둔다', () => {
    const segments = buildDiffSegments([hunkAt15()], text(30), text(30));

    expect(segments.map(segment => segment.type)).toEqual([
      'collapsed',
      'hunk',
      'collapsed',
    ]);

    const leading = segments[0];
    expect(leading).toMatchObject({ type: 'collapsed', newStart: 1, count: 11 });

    const trailing = segments[2];
    expect(trailing).toMatchObject({ type: 'collapsed', newStart: 19, count: 12 });
  });

  it('작은 gap은 접지 않고 context로 펼쳐 둔다', () => {
    const segments = buildDiffSegments([hunkAt15()], text(22), text(22));

    // 앞쪽 11줄은 임계값(10)보다 커서 접히고, 뒤쪽 4줄은 그대로 표시된다.
    expect(segments.map(segment => segment.type)).toEqual([
      'collapsed',
      'hunk',
      'hunk',
    ]);

    const tail = segments[2];
    expect(tail.type === 'hunk' && tail.hunk.lines).toHaveLength(4);
    expect(
      tail.type === 'hunk' && tail.hunk.lines.every(l => l.type === 'context'),
    ).toBe(true);
  });

  it('hunk가 파일 전체를 덮으면 접힌 구간이 없다', () => {
    const wholeFile: DiffHunk = {
      header: '@@ -0,0 +1,3 @@',
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 3,
      lines: [
        { type: 'add', content: 'a', newLineNumber: 1 },
        { type: 'add', content: 'b', newLineNumber: 2 },
        { type: 'add', content: 'c', newLineNumber: 3 },
      ],
    };

    const segments = buildDiffSegments([wholeFile], '', 'a\nb\nc\n');

    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('hunk');
  });

  it('접힌 구간의 줄 번호가 실제 파일 내용과 맞는다', () => {
    const segments = buildDiffSegments([hunkAt15()], text(30), text(30));
    const collapsed = segments[0];

    expect(collapsed.type).toBe('collapsed');

    if (collapsed.type !== 'collapsed') {
      return;
    }

    const expanded = expandCollapsed(collapsed, text(30), 'all', 20);
    const hunk = expanded[0];

    expect(hunk.type).toBe('hunk');

    if (hunk.type !== 'hunk') {
      return;
    }

    expect(hunk.hunk.lines[0]).toMatchObject({
      content: 'line1',
      newLineNumber: 1,
    });
    expect(hunk.hunk.lines[10]).toMatchObject({
      content: 'line11',
      newLineNumber: 11,
    });
  });
});

describe('expandCollapsed', () => {
  const collapsed = {
    type: 'collapsed' as const,
    oldStart: 1,
    newStart: 1,
    count: 50,
  };

  it('위에서부터 step만큼 펼치고 나머지는 접힌 채로 둔다', () => {
    const result = expandCollapsed(collapsed, text(60), 'top', 20);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('hunk');
    expect(result[1]).toMatchObject({
      type: 'collapsed',
      newStart: 21,
      count: 30,
    });
  });

  it('아래에서부터 펼치면 접힌 구간이 앞에 남는다', () => {
    const result = expandCollapsed(collapsed, text(60), 'bottom', 20);

    expect(result[0]).toMatchObject({ type: 'collapsed', count: 30 });
    expect(result[1].type).toBe('hunk');

    const hunk = result[1];
    expect(hunk.type === 'hunk' && hunk.hunk.newStart).toBe(31);
  });

  it('all이면 한 번에 모두 펼친다', () => {
    const result = expandCollapsed(collapsed, text(60), 'all', 20);

    expect(result).toHaveLength(1);
    expect(result[0].type === 'hunk' && result[0].hunk.lines).toHaveLength(50);
  });

  it('남은 줄이 step보다 적으면 전부 펼친다', () => {
    const small = { ...collapsed, count: 5 };
    const result = expandCollapsed(small, text(60), 'top', 20);

    expect(result).toHaveLength(1);
  });
});
