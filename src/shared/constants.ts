/** git --format 안에서 record 시작을 표시하는 marker. name-status 출력과 구분한다. */
export const COMMIT_RECORD_MARKER = '__GWB_COMMIT__';

/** git --format 안에서 필드를 구분하는 문자. NUL은 -z 출력의 record 구분과 겹치므로 US(0x1f)를 쓴다. */
export const FIELD_SEPARATOR = '';

export const DEFAULT_COMMIT_PAGE_SIZE = 200;
export const DEFAULT_FILE_HISTORY_PAGE_SIZE = 100;
export const DEFAULT_MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

/** full-file 모드에서 렌더링을 허용하는 최대 줄 수. */
export const MAX_FULL_DIFF_LINES = 50_000;

/** full 모드에서 이 줄 수를 넘는 unchanged gap은 접는다. */
export const COLLAPSE_THRESHOLD = 10;

/** 접힌 구간을 한 번에 펼치는 줄 수. */
export const EXPAND_STEP = 20;

export const SEARCH_DEBOUNCE_MS = 300;

/** git이 비어 있는 tree를 가리키는 고정 hash. root commit 비교에 사용한다. */
export const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
