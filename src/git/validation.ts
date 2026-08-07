import { GitWorkbenchError } from '../shared/errors';

const HASH_PATTERN = /^[0-9a-f]{4,64}$/;

/** webview가 보낸 commit hash를 검증한다. */
export function assertCommitHash(value: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new GitWorkbenchError(
      'INVALID_REVISION',
      `commit hash 형식이 아닙니다: ${value}`,
    );
  }

  return value;
}

/**
 * webview가 보낸 저장소 상대 경로를 검증한다.
 * git 인자 배열로만 전달하므로 shell escape는 필요 없지만,
 * revision expression(`<rev>:<path>`)에 합칠 때를 대비해 경로 모양을 제한한다.
 */
export function assertRelativePath(value: string): string {
  if (value === '') {
    throw new GitWorkbenchError('INVALID_REVISION', '빈 경로입니다.');
  }

  if (value.includes('\0')) {
    throw new GitWorkbenchError('INVALID_REVISION', '경로에 NUL이 있습니다.');
  }

  if (value.startsWith('/') || /^[a-zA-Z]:/.test(value)) {
    throw new GitWorkbenchError(
      'INVALID_REVISION',
      `저장소 상대 경로가 아닙니다: ${value}`,
    );
  }

  if (value.split('/').some(segment => segment === '..')) {
    throw new GitWorkbenchError(
      'INVALID_REVISION',
      `상위 디렉터리를 벗어나는 경로입니다: ${value}`,
    );
  }

  return value;
}

/** ref 이름을 검증한다. `-`로 시작하면 git 옵션으로 해석될 수 있어 거부한다. */
export function assertRefName(value: string): string {
  if (value === '' || value.startsWith('-')) {
    throw new GitWorkbenchError(
      'INVALID_REVISION',
      `사용할 수 없는 ref 이름입니다: ${value}`,
    );
  }

  if (/[\s~^:?*[\\\0]/.test(value)) {
    throw new GitWorkbenchError(
      'INVALID_REVISION',
      `ref 이름에 허용되지 않는 문자가 있습니다: ${value}`,
    );
  }

  return value;
}

/** 검색 필터 문자열이 git 옵션으로 해석되지 않도록 앞의 `-`를 막는다. */
export function assertFilterValue(label: string, value: string): string {
  if (value.includes('\0')) {
    throw new GitWorkbenchError(
      'INVALID_REVISION',
      `${label}에 NUL이 있습니다.`,
    );
  }

  return value;
}

export function clampLimit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}

export interface FileHistoryCursor {
  /** 다음 페이지의 첫 커밋. 이 커밋을 포함해서 읽는다. */
  hash: string;
  /** 그 커밋 시점의 파일 경로. rename 이후 페이지에서는 예전 경로가 된다. */
  path: string;
}

/**
 * File History cursor는 `<hash>:<path>` 형태다.
 *
 * `--skip`을 쓸 수 없어서 hash를 시작 revision으로 쓴다.
 * `--follow`와 `--skip`을 같이 주면 git이 rename 이전 이력을 잇지 못한다.
 * `--skip`이 rename을 따라가기 전의 경로 기준으로 먼저 적용되기 때문에,
 * skip 값이 현재 경로의 커밋 수를 넘는 순간 결과가 통째로 비어 버린다.
 */
export function encodeFileHistoryCursor(hash: string, path: string): string {
  return `${hash}:${path}`;
}

export function parseFileHistoryCursor(
  cursor: string | undefined,
): FileHistoryCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  const separator = cursor.indexOf(':');

  if (separator <= 0) {
    throw new GitWorkbenchError(
      'INVALID_REVISION',
      `cursor 형식이 올바르지 않습니다: ${cursor}`,
    );
  }

  return {
    hash: assertCommitHash(cursor.slice(0, separator)),
    path: assertRelativePath(cursor.slice(separator + 1)),
  };
}

/** cursor는 skip 개수를 담은 문자열이다. */
export function parseCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }

  const parsed = Number(cursor);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}
