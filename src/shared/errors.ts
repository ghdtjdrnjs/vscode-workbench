import type { GitWorkbenchErrorCode } from './models';

export class GitWorkbenchError extends Error {
  public constructor(
    public readonly code: GitWorkbenchErrorCode,
    message: string,
    public readonly recoverable: boolean = true,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'GitWorkbenchError';
  }
}

const USER_MESSAGES: Record<GitWorkbenchErrorCode, string> = {
  GIT_NOT_FOUND:
    'Git executable을 찾을 수 없습니다. VS Code Git 설정을 확인하세요.',
  REPOSITORY_NOT_FOUND: 'Git 저장소를 찾을 수 없습니다.',
  FILE_OUTSIDE_REPOSITORY:
    '선택한 파일은 Git 저장소에 포함되어 있지 않습니다.',
  INVALID_REVISION: '유효하지 않은 revision입니다.',
  OBJECT_NOT_FOUND:
    '해당 commit object를 로컬 저장소에서 찾을 수 없습니다.',
  BINARY_FILE: 'Binary file은 텍스트 diff를 표시할 수 없습니다.',
  FILE_TOO_LARGE:
    '파일 크기가 전체 보기 제한을 초과했습니다. 변경 구간만 표시합니다.',
  REQUEST_CANCELLED: '요청이 취소되었습니다.',
  GIT_COMMAND_FAILED: 'Git 명령 실행에 실패했습니다.',
  PARSER_FAILED: 'Git 출력을 해석하지 못했습니다.',
  UNSUPPORTED_WORKSPACE:
    'Git Workbench는 신뢰된 workspace에서만 동작합니다.',
  NO_HISTORY: '이 파일에 대한 commit 이력이 없습니다.',
  WORKING_TREE_DIRTY:
    '작업 디렉터리에 커밋되지 않은 변경이 있습니다. 먼저 커밋하거나 stash하세요.',
  CHERRY_PICK_CONFLICT:
    'cherry-pick 중 충돌이 발생했습니다. 충돌을 해결한 뒤 이어서 진행하거나 취소하세요.',
  UNKNOWN: '알 수 없는 오류가 발생했습니다.',
};

export function userMessageFor(code: GitWorkbenchErrorCode): string {
  return USER_MESSAGES[code] ?? USER_MESSAGES.UNKNOWN;
}

/** git stderr 문자열에서 더 구체적인 오류 코드를 추론한다. */
export function classifyGitStderr(stderr: string): GitWorkbenchErrorCode {
  const text = stderr.toLowerCase();

  if (
    text.includes('bad object') ||
    text.includes('unknown revision') ||
    text.includes('not a valid object name')
  ) {
    return 'OBJECT_NOT_FOUND';
  }

  if (text.includes('ambiguous argument')) {
    return 'INVALID_REVISION';
  }

  if (text.includes('not a git repository')) {
    return 'REPOSITORY_NOT_FOUND';
  }

  return 'GIT_COMMAND_FAILED';
}

export function toGitWorkbenchError(error: unknown): GitWorkbenchError {
  if (error instanceof GitWorkbenchError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new GitWorkbenchError('UNKNOWN', message, true, { cause: error });
}
