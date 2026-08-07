import { GitWorkbenchError } from '../../shared/errors';
import type { DiffHunk, DiffLine } from '../../shared/models';

export interface ParsedPatch {
  hunks: DiffHunk[];
  binary: boolean;
  isNewFile: boolean;
  isDeletedFile: boolean;
  oldMode?: string;
  newMode?: string;
}

const HUNK_HEADER =
  /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/**
 * 단일 파일에 대한 unified patch를 파싱한다.
 *
 * `diff --git a/… b/…` 헤더에서 경로를 뽑지 않는다.
 * 공백이 포함된 경로에서는 a/b 경계를 확정할 수 없고, git이 `---`/`+++` 줄 뒤에
 * TAB을 덧붙이기 때문이다. 경로는 항상 name-status 결과를 사용한다.
 */
export function parsePatch(
  patchText: string,
  commandLabel: string,
): ParsedPatch {
  const result: ParsedPatch = {
    hunks: [],
    binary: false,
    isNewFile: false,
    isDeletedFile: false,
  };

  if (patchText.trim() === '') {
    return result;
  }

  const lines = patchText.split('\n');
  let current: DiffHunk | undefined;
  let oldLine = 0;
  let newLine = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (current === undefined) {
      if (line.startsWith('new file mode ')) {
        result.isNewFile = true;
        result.newMode = line.slice('new file mode '.length).trim();
        continue;
      }

      if (line.startsWith('deleted file mode ')) {
        result.isDeletedFile = true;
        result.oldMode = line.slice('deleted file mode '.length).trim();
        continue;
      }

      if (line.startsWith('old mode ')) {
        result.oldMode = line.slice('old mode '.length).trim();
        continue;
      }

      if (line.startsWith('new mode ')) {
        result.newMode = line.slice('new mode '.length).trim();
        continue;
      }

      if (
        line.startsWith('Binary files ') ||
        line.startsWith('GIT binary patch')
      ) {
        result.binary = true;
        return result;
      }
    }

    const headerMatch = HUNK_HEADER.exec(line);

    if (headerMatch) {
      current = {
        header: line,
        oldStart: Number(headerMatch[1]),
        oldLines: headerMatch[2] === undefined ? 1 : Number(headerMatch[2]),
        newStart: Number(headerMatch[3]),
        newLines: headerMatch[4] === undefined ? 1 : Number(headerMatch[4]),
        lines: [],
      };
      oldLine = current.oldStart;
      newLine = current.newStart;
      result.hunks.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    // hunk 안에서는 첫 글자가 줄 종류를 결정한다.
    const marker = line[0];

    if (marker === '\\') {
      // "\ No newline at end of file" — 직전 줄에 표시한다.
      const previous = current.lines[current.lines.length - 1];

      if (previous) {
        previous.noNewlineAtEof = true;
      }

      continue;
    }

    if (marker === '+') {
      current.lines.push({
        type: 'add',
        content: line.slice(1),
        newLineNumber: newLine,
      });
      newLine += 1;
      continue;
    }

    if (marker === '-') {
      current.lines.push({
        type: 'delete',
        content: line.slice(1),
        oldLineNumber: oldLine,
      });
      oldLine += 1;
      continue;
    }

    if (marker === ' ') {
      current.lines.push({
        type: 'context',
        content: line.slice(1),
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      });
      oldLine += 1;
      newLine += 1;
      continue;
    }

    if (line === '') {
      // patch 마지막의 빈 줄. hunk 안에서는 무시한다.
      continue;
    }

    if (line.startsWith('diff --git ')) {
      // 같은 patch에 다른 파일이 이어지는 경우. 첫 파일만 사용한다.
      break;
    }

    throw new GitWorkbenchError(
      'PARSER_FAILED',
      `${commandLabel}: hunk 안에서 알 수 없는 줄 접두어 "${marker}" (line ${index + 1})`,
    );
  }

  return result;
}

/** hunk의 실제 줄 수가 header와 맞는지 확인한다. 테스트용. */
export function hunkLineCounts(hunk: DiffHunk): {
  old: number;
  new: number;
} {
  let oldCount = 0;
  let newCount = 0;

  for (const line of hunk.lines) {
    if (line.type === 'context') {
      oldCount += 1;
      newCount += 1;
    } else if (line.type === 'add') {
      newCount += 1;
    } else if (line.type === 'delete') {
      oldCount += 1;
    }
  }

  return { old: oldCount, new: newCount };
}

export type { DiffLine };
