import { COLLAPSE_THRESHOLD } from './constants';
import type { DiffHunk, DiffLine, DiffSegment } from './models';

/** 파일 텍스트를 줄 배열로 만든다. 끝의 개행이 만드는 빈 줄은 제거한다. */
export function splitLines(text: string): string[] {
  if (text === '') {
    return [];
  }

  const lines = text.split('\n');

  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}

/**
 * patch hunk와 전체 파일 텍스트를 합쳐 full-file 보기용 segment를 만든다.
 * hunk 사이의 unchanged 구간이 임계값보다 크면 접힌 구간으로 남긴다.
 */
export function buildDiffSegments(
  hunks: readonly DiffHunk[],
  oldText: string,
  newText: string,
  collapseThreshold: number = COLLAPSE_THRESHOLD,
): DiffSegment[] {
  const newLines = splitLines(newText);
  const oldLines = splitLines(oldText);
  const sorted = [...hunks].sort((a, b) => a.newStart - b.newStart);

  const segments: DiffSegment[] = [];
  let oldCursor = 1;
  let newCursor = 1;

  const pushGap = (count: number): void => {
    if (count <= 0) {
      return;
    }

    if (count <= collapseThreshold) {
      segments.push({
        type: 'hunk',
        hunk: contextHunk(oldCursor, newCursor, count, newLines),
      });
    } else {
      segments.push({
        type: 'collapsed',
        oldStart: oldCursor,
        newStart: newCursor,
        count,
      });
    }

    oldCursor += count;
    newCursor += count;
  };

  for (const hunk of sorted) {
    pushGap(Math.min(hunk.oldStart - oldCursor, hunk.newStart - newCursor));

    segments.push({ type: 'hunk', hunk });

    oldCursor = Math.max(oldCursor, hunk.oldStart + hunk.oldLines);
    newCursor = Math.max(newCursor, hunk.newStart + hunk.newLines);
  }

  pushGap(
    Math.min(oldLines.length - oldCursor + 1, newLines.length - newCursor + 1),
  );

  return segments;
}

/** 접힌 구간의 일부 또는 전부를 실제 줄로 펼친다. */
export function expandCollapsed(
  segment: Extract<DiffSegment, { type: 'collapsed' }>,
  newText: string,
  direction: 'top' | 'bottom' | 'all',
  step: number,
): DiffSegment[] {
  const newLines = splitLines(newText);

  if (direction === 'all' || segment.count <= step) {
    return [
      {
        type: 'hunk',
        hunk: contextHunk(
          segment.oldStart,
          segment.newStart,
          segment.count,
          newLines,
        ),
      },
    ];
  }

  if (direction === 'top') {
    return [
      {
        type: 'hunk',
        hunk: contextHunk(segment.oldStart, segment.newStart, step, newLines),
      },
      {
        type: 'collapsed',
        oldStart: segment.oldStart + step,
        newStart: segment.newStart + step,
        count: segment.count - step,
      },
    ];
  }

  const remaining = segment.count - step;

  return [
    {
      type: 'collapsed',
      oldStart: segment.oldStart,
      newStart: segment.newStart,
      count: remaining,
    },
    {
      type: 'hunk',
      hunk: contextHunk(
        segment.oldStart + remaining,
        segment.newStart + remaining,
        step,
        newLines,
      ),
    },
  ];
}

function contextHunk(
  oldStart: number,
  newStart: number,
  count: number,
  newLines: readonly string[],
): DiffHunk {
  const lines: DiffLine[] = [];

  for (let offset = 0; offset < count; offset += 1) {
    lines.push({
      type: 'context',
      content: newLines[newStart - 1 + offset] ?? '',
      oldLineNumber: oldStart + offset,
      newLineNumber: newStart + offset,
    });
  }

  return {
    header: '',
    oldStart,
    oldLines: count,
    newStart,
    newLines: count,
    lines,
  };
}
