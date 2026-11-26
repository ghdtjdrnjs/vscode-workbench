import type {
  BranchRef,
  CommitDetail,
  CommitSummary,
  DiffModel,
  FileHistoryResult,
  GitWorkbenchErrorCode,
  RepositoryInfo,
} from './models';

/** Webview가 화면 동작에 쓰는 설정값. Extension Host가 읽어 전달한다. */
export interface WorkbenchSettings {
  commitPageSize: number;
  fileHistoryPageSize: number;
  showCommitGraph: boolean;
}

export interface CommitFilters {
  ref?: string;
  author?: string;
  since?: string;
  until?: string;
  message?: string;
  allRefs: boolean;
}

export type WebviewRequest =
  | { type: 'ping'; requestId: string }
  | { type: 'repository/list'; requestId: string }
  | {
      type: 'fileHistory/load';
      requestId: string;
      uri: string;
      limit: number;
      cursor?: string;
    }
  | {
      type: 'refs/load';
      requestId: string;
      repositoryId: string;
    }
  | {
      type: 'commitLog/search';
      requestId: string;
      repositoryId: string;
      filters: CommitFilters;
      cursor?: string;
      limit: number;
    }
  | {
      type: 'commitDetail/load';
      requestId: string;
      repositoryId: string;
      commitHash: string;
      parentIndex: number;
    }
  | {
      type: 'diff/load';
      requestId: string;
      repositoryId: string;
      commitHash: string;
      parentIndex: number;
      oldPath?: string;
      newPath: string;
      mode: 'changes' | 'full';
    }
  | {
      type: 'diff/openInEditor';
      requestId: string;
      repositoryId: string;
      commitHash: string;
      parentIndex: number;
      oldPath?: string;
      newPath: string;
    }
  | {
      type: 'commit/cherryPick';
      requestId: string;
      repositoryId: string;
      commitHash: string;
    }
  | { type: 'request/cancel'; requestId: string; targetRequestId: string };

export type ExtensionResponse =
  | { type: 'pong'; requestId: string }
  | {
      type: 'repository/listResult';
      requestId: string;
      repositories: RepositoryInfo[];
      settings: WorkbenchSettings;
    }
  | { type: 'fileHistory/result'; requestId: string; result: FileHistoryResult }
  | { type: 'refs/result'; requestId: string; refs: BranchRef[] }
  | {
      type: 'commitLog/result';
      requestId: string;
      commits: CommitSummary[];
      hasMore: boolean;
      nextCursor?: string;
    }
  | { type: 'commitDetail/result'; requestId: string; detail: CommitDetail }
  | { type: 'diff/result'; requestId: string; diff: DiffModel }
  | { type: 'diff/openedInEditor'; requestId: string }
  | {
      type: 'commit/cherryPickResult';
      requestId: string;
      status: 'applied' | 'conflict' | 'empty' | 'cancelled';
      message: string;
    }
  | {
      type: 'request/error';
      requestId: string;
      code: GitWorkbenchErrorCode;
      message: string;
      recoverable: boolean;
    };

/** Extension Host가 요청 없이 먼저 보내는 알림. */
export type ExtensionNotification =
  | {
      type: 'route/fileHistory';
      uri: string;
      fileName: string;
      repositoryName: string;
    }
  | { type: 'route/commitLog' }
  | { type: 'repositories/changed' }
  | { type: 'refresh' };

export type ExtensionMessage = ExtensionResponse | ExtensionNotification;

/**
 * Webview가 응답 없이 보내는 알림. request 흐름과 별개라 MessageRouter를 거치지 않는다.
 * 화면이 죽은 상황에서도 보낼 수 있어야 하므로 requestId가 없다.
 */
export type WebviewEvent =
  | {
      type: 'webview/error';
      message: string;
      stack?: string;
      componentStack?: string;
    }
  | { type: 'webview/reload' };

/** 요청 그룹. 같은 그룹에 새 요청이 오면 이전 요청을 취소한다. */
export type RequestGroup =
  | 'fileHistory'
  | 'commitLog'
  | 'commitDetail'
  | 'diff'
  | 'refs'
  | 'misc';

export function requestGroupOf(type: WebviewRequest['type']): RequestGroup {
  switch (type) {
    case 'fileHistory/load':
      return 'fileHistory';
    case 'commitLog/search':
      return 'commitLog';
    case 'commitDetail/load':
      return 'commitDetail';
    case 'diff/load':
      return 'diff';
    case 'refs/load':
      return 'refs';
    case 'commit/cherryPick':
      // 쓰기 작업이다. 다른 요청 때문에 중간에 취소되면 안 된다.
      return 'misc';
    case 'diff/openInEditor':
      // 편집기를 여는 동작이라 뒤이은 diff 요청에 취소되면 안 된다.
      return 'misc';
    default:
      return 'misc';
  }
}
