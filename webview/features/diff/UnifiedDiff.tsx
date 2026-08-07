import type { DiffHunk, DiffLine } from '../../../src/shared/models';

const LINE_CLASS: Record<DiffLine['type'], string> = {
  context: 'diff-line context',
  add: 'diff-line add',
  delete: 'diff-line delete',
  meta: 'diff-line meta',
};

const LINE_MARKER: Record<DiffLine['type'], string> = {
  context: ' ',
  add: '+',
  delete: '-',
  meta: ' ',
};

export function UnifiedHunk({
  hunk,
  showHeader,
}: {
  hunk: DiffHunk;
  showHeader: boolean;
}): JSX.Element {
  return (
    <div className="diff-hunk">
      {showHeader && hunk.header ? (
        <div className="diff-line hunk-header">
          <span className="diff-gutter" />
          <span className="diff-gutter" />
          <span className="diff-marker" />
          <span className="diff-content">{hunk.header}</span>
        </div>
      ) : null}
      {hunk.lines.map((line, index) => (
        <UnifiedLine key={index} line={line} />
      ))}
    </div>
  );
}

function UnifiedLine({ line }: { line: DiffLine }): JSX.Element {
  return (
    <div className={LINE_CLASS[line.type]}>
      <span className="diff-gutter">{line.oldLineNumber ?? ''}</span>
      <span className="diff-gutter">{line.newLineNumber ?? ''}</span>
      <span className="diff-marker">{LINE_MARKER[line.type]}</span>
      <span className="diff-content">
        {line.content}
        {line.noNewlineAtEof ? (
          <span className="diff-eof-note"> ⏎ 파일 끝에 개행 없음</span>
        ) : null}
      </span>
    </div>
  );
}
