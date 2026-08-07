import type { DiffHunk, DiffLine } from '../../../src/shared/models';

interface SideRow {
  left?: DiffLine;
  right?: DiffLine;
}

/**
 * unified hunk를 좌/우 두 열로 재배치한다.
 * 연속된 delete 묶음과 add 묶음을 같은 행에 짝지어 놓는다.
 */
export function toSideRows(hunk: DiffHunk): SideRow[] {
  const rows: SideRow[] = [];
  let index = 0;

  while (index < hunk.lines.length) {
    const line = hunk.lines[index];

    if (line.type === 'context' || line.type === 'meta') {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }

    const deletions: DiffLine[] = [];
    const additions: DiffLine[] = [];

    while (index < hunk.lines.length && hunk.lines[index].type === 'delete') {
      deletions.push(hunk.lines[index]);
      index += 1;
    }

    while (index < hunk.lines.length && hunk.lines[index].type === 'add') {
      additions.push(hunk.lines[index]);
      index += 1;
    }

    const pairCount = Math.max(deletions.length, additions.length);

    for (let offset = 0; offset < pairCount; offset += 1) {
      rows.push({
        left: deletions[offset],
        right: additions[offset],
      });
    }
  }

  return rows;
}

export function SideBySideHunk({
  hunk,
  showHeader,
}: {
  hunk: DiffHunk;
  showHeader: boolean;
}): JSX.Element {
  const rows = toSideRows(hunk);

  return (
    <div className="diff-hunk">
      {showHeader && hunk.header ? (
        <div className="side-row hunk-header">
          <span className="diff-gutter" />
          <span className="diff-content">{hunk.header}</span>
          <span className="diff-gutter" />
          <span className="diff-content" />
        </div>
      ) : null}
      {rows.map((row, index) => (
        <div className="side-row" key={index}>
          <span className="diff-gutter">{row.left?.oldLineNumber ?? ''}</span>
          <span className={cellClass(row.left, 'delete')}>
            {row.left?.content ?? ''}
          </span>
          <span className="diff-gutter">{row.right?.newLineNumber ?? ''}</span>
          <span className={cellClass(row.right, 'add')}>
            {row.right?.content ?? ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function cellClass(
  line: DiffLine | undefined,
  changedClass: 'add' | 'delete',
): string {
  if (!line) {
    return 'diff-content empty-cell';
  }

  return line.type === 'context'
    ? 'diff-content context'
    : `diff-content ${changedClass}`;
}
