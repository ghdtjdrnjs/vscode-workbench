/**
 * Extension Host와 Webview가 함께 import하는 데이터 모델.
 * 이 파일은 vscode API에 의존하지 않는다.
 */

export interface RepositoryInfo {
  id: string;
  rootUri: string;
  name: string;
  headName?: string;
  headCommit?: string;
}

export type RefKind = 'local' | 'remote' | 'tag';

export interface BranchRef {
  fullName: string;
  shortName: string;
  kind: RefKind;
  commitHash: string;
  upstream?: string;
  isCurrent: boolean;
  isSymbolic: boolean;
}

export interface CommitSummary {
  hash: string;
  shortHash: string;
  parentHashes: string[];
  authorName: string;
  authorEmail?: string;
  authorDate: string;
  committerDate?: string;
  subject: string;
  body?: string;
  decorations: string[];
}

export type ChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';

export interface ChangedFile {
  status: ChangeStatus;
  oldPath?: string;
  newPath: string;
  similarity?: number;
  isBinary?: boolean;
}

export interface CommitDetail extends CommitSummary {
  containingBranches: BranchRef[];
  changedFiles: ChangedFile[];
  parentIndex: number;
}

export interface FileHistoryEntry extends CommitSummary {
  pathAtCommit: string;
  previousPath?: string;
  status?: ChangeStatus;
}

export interface FileHistoryResult {
  repository: RepositoryInfo;
  requestedUri: string;
  relativePath: string;
  entries: FileHistoryEntry[];
  hasMore: boolean;
  nextCursor?: string;
}

export type DiffViewMode = 'changes' | 'full';
export type DiffLayout = 'unified' | 'side-by-side';

export interface DiffFileVersion {
  revision?: string;
  path?: string;
  text?: string;
  size?: number;
  exists: boolean;
}

export type DiffLineType = 'context' | 'add' | 'delete' | 'meta';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  /** `\ No newline at end of file` marker가 이 줄 뒤에 붙어 있었는지. */
  noNewlineAtEof?: boolean;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffModel {
  repositoryId: string;
  commitHash: string;
  parentIndex: number;
  oldFile: DiffFileVersion;
  newFile: DiffFileVersion;
  status: ChangeStatus;
  hunks: DiffHunk[];
  binary: boolean;
  truncated: boolean;
  truncationReason?: string;
  /** full 모드로 전환 가능한지. 파일이 너무 크거나 binary이면 false. */
  fullViewAvailable: boolean;
}

/** full-file 보기용 segment. hunk 사이의 unchanged 구간을 접어서 표현한다. */
export type DiffSegment =
  | {
      type: 'collapsed';
      oldStart: number;
      newStart: number;
      count: number;
    }
  | {
      type: 'hunk';
      hunk: DiffHunk;
    };

export type GitWorkbenchErrorCode =
  | 'GIT_NOT_FOUND'
  | 'REPOSITORY_NOT_FOUND'
  | 'FILE_OUTSIDE_REPOSITORY'
  | 'INVALID_REVISION'
  | 'OBJECT_NOT_FOUND'
  | 'BINARY_FILE'
  | 'FILE_TOO_LARGE'
  | 'REQUEST_CANCELLED'
  | 'GIT_COMMAND_FAILED'
  | 'PARSER_FAILED'
  | 'UNSUPPORTED_WORKSPACE'
  | 'NO_HISTORY'
  | 'UNKNOWN';
