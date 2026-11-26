import * as vscode from 'vscode';
import type { CherryPickService } from '../git/CherryPickService';
import type { CommitDetailService } from '../git/CommitDetailService';
import type { CommitLogService } from '../git/CommitLogService';
import type { DiffService } from '../git/DiffService';
import type { FileHistoryService } from '../git/FileHistoryService';
import type { RepositoryResolver } from '../git/RepositoryResolver';
import {
  DEFAULT_COMMIT_PAGE_SIZE,
  DEFAULT_FILE_HISTORY_PAGE_SIZE,
} from '../shared/constants';
import { GitWorkbenchError, toGitWorkbenchError } from '../shared/errors';
import type {
  ExtensionResponse,
  WebviewRequest,
  WorkbenchSettings,
} from '../shared/protocol';
import { requestGroupOf, type RequestGroup } from '../shared/protocol';

export interface MessageRouterDeps {
  resolver: RepositoryResolver;
  fileHistory: FileHistoryService;
  commitLog: CommitLogService;
  commitDetail: CommitDetailService;
  diff: DiffService;
  cherryPick: CherryPickService;
  /** 변경 파일을 VS Code diff 편집기에서 연다. */
  openDiffInEditor: (query: {
    repositoryId: string;
    commitHash: string;
    parentIndex: number;
    oldPath?: string;
    newPath: string;
  }) => Promise<void>;
  output: vscode.OutputChannel;
  post: (message: ExtensionResponse) => void;
}

/**
 * Webview → Extension Host 요청을 검증하고 서비스로 넘긴다.
 * 같은 그룹에 새 요청이 오면 이전 요청의 CancellationTokenSource를 정리한다.
 */
export class MessageRouter implements vscode.Disposable {
  private readonly inFlight = new Map<RequestGroup, vscode.CancellationTokenSource>();
  private readonly byRequestId = new Map<string, vscode.CancellationTokenSource>();

  public constructor(private readonly deps: MessageRouterDeps) {}

  public dispose(): void {
    for (const source of this.inFlight.values()) {
      source.cancel();
      source.dispose();
    }

    this.inFlight.clear();
    this.byRequestId.clear();
  }

  public async handle(raw: unknown): Promise<void> {
    const request = validateRequest(raw);

    if (!request) {
      this.deps.output.appendLine(
        `[router] 알 수 없는 message: ${safeStringify(raw)}`,
      );
      return;
    }

    if (request.type === 'request/cancel') {
      this.cancelRequest(request.targetRequestId);
      return;
    }

    const group = requestGroupOf(request.type);
    const source = this.beginRequest(group, request.requestId);

    try {
      const response = await this.dispatch(request, source.token);

      if (response) {
        this.deps.post(response);
      }
    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        // 취소는 UI에 오류로 표시하지 않는다.
        this.deps.output.appendLine(
          `[router] cancelled ${request.type} (${request.requestId})`,
        );
      } else {
        const wrapped = toGitWorkbenchError(error);
        this.deps.output.appendLine(
          `[router] ${request.type} failed: ${wrapped.code} ${wrapped.message}`,
        );
        this.deps.post({
          type: 'request/error',
          requestId: request.requestId,
          code: wrapped.code,
          message: wrapped.message,
          recoverable: wrapped.recoverable,
        });
      }
    } finally {
      this.endRequest(group, request.requestId, source);
    }
  }

  private async dispatch(
    request: Exclude<WebviewRequest, { type: 'request/cancel' }>,
    token: vscode.CancellationToken,
  ): Promise<ExtensionResponse | undefined> {
    switch (request.type) {
      case 'ping':
        return { type: 'pong', requestId: request.requestId };

      case 'repository/list':
        return {
          type: 'repository/listResult',
          requestId: request.requestId,
          repositories: this.deps.resolver.listInfo(),
          settings: readSettings(),
        };

      case 'fileHistory/load': {
        const uri = parseUri(request.uri);
        const result = await this.deps.fileHistory.load(
          { uri, limit: request.limit, cursor: request.cursor },
          token,
        );
        return {
          type: 'fileHistory/result',
          requestId: request.requestId,
          result,
        };
      }

      case 'refs/load': {
        const refs = await this.deps.commitLog.loadRefs(
          request.repositoryId,
          token,
        );
        return { type: 'refs/result', requestId: request.requestId, refs };
      }

      case 'commitLog/search': {
        const page = await this.deps.commitLog.load(
          {
            repositoryId: request.repositoryId,
            filters: request.filters,
            limit: request.limit,
            cursor: request.cursor,
          },
          token,
        );
        return {
          type: 'commitLog/result',
          requestId: request.requestId,
          commits: page.commits,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        };
      }

      case 'commitDetail/load': {
        const detail = await this.deps.commitDetail.load(
          {
            repositoryId: request.repositoryId,
            commitHash: request.commitHash,
            parentIndex: request.parentIndex,
          },
          token,
        );
        return {
          type: 'commitDetail/result',
          requestId: request.requestId,
          detail,
        };
      }

      case 'diff/load': {
        const diff = await this.deps.diff.load(
          {
            repositoryId: request.repositoryId,
            commitHash: request.commitHash,
            parentIndex: request.parentIndex,
            oldPath: request.oldPath,
            newPath: request.newPath,
            mode: request.mode,
          },
          token,
        );
        return { type: 'diff/result', requestId: request.requestId, diff };
      }

      case 'diff/openInEditor': {
        await this.deps.openDiffInEditor({
          repositoryId: request.repositoryId,
          commitHash: request.commitHash,
          parentIndex: request.parentIndex,
          oldPath: request.oldPath,
          newPath: request.newPath,
        });
        return { type: 'diff/openedInEditor', requestId: request.requestId };
      }

      case 'commit/cherryPick': {
        const subject = await this.deps.cherryPick.describe(
          request.repositoryId,
          request.commitHash,
          token,
        );

        // 저장소를 바꾸는 유일한 동작이다. 반드시 확인을 받는다.
        const confirm = await vscode.window.showWarningMessage(
          `이 커밋을 현재 브랜치에 적용할까요?\n\n${request.commitHash.slice(0, 7)}  ${subject}`,
          { modal: true, detail: 'cherry-pick은 현재 브랜치에 새 커밋을 만듭니다.' },
          'Cherry-Pick',
        );

        if (confirm !== 'Cherry-Pick') {
          return {
            type: 'commit/cherryPickResult',
            requestId: request.requestId,
            status: 'cancelled',
            message: '취소했습니다.',
          };
        }

        const outcome = await this.deps.cherryPick.run(
          request.repositoryId,
          request.commitHash,
          token,
        );

        if (outcome.status === 'applied') {
          void vscode.window.showInformationMessage(outcome.message);
        } else {
          void vscode.window.showWarningMessage(outcome.message);
        }

        return {
          type: 'commit/cherryPickResult',
          requestId: request.requestId,
          status: outcome.status,
          message: outcome.message,
        };
      }

      default: {
        const exhaustive: never = request;
        throw new GitWorkbenchError(
          'UNKNOWN',
          `처리할 수 없는 요청입니다: ${safeStringify(exhaustive)}`,
        );
      }
    }
  }

  private beginRequest(
    group: RequestGroup,
    requestId: string,
  ): vscode.CancellationTokenSource {
    if (group !== 'misc') {
      const previous = this.inFlight.get(group);

      if (previous) {
        previous.cancel();
        previous.dispose();
      }
    }

    const source = new vscode.CancellationTokenSource();

    if (group !== 'misc') {
      this.inFlight.set(group, source);
    }

    this.byRequestId.set(requestId, source);

    return source;
  }

  private endRequest(
    group: RequestGroup,
    requestId: string,
    source: vscode.CancellationTokenSource,
  ): void {
    this.byRequestId.delete(requestId);

    if (this.inFlight.get(group) === source) {
      this.inFlight.delete(group);
    }

    source.dispose();
  }

  private cancelRequest(targetRequestId: string): void {
    const source = this.byRequestId.get(targetRequestId);

    if (source) {
      source.cancel();
    }
  }
}

function readSettings(): WorkbenchSettings {
  const config = vscode.workspace.getConfiguration('gitWorkbench');

  return {
    commitPageSize: config.get<number>(
      'commitPageSize',
      DEFAULT_COMMIT_PAGE_SIZE,
    ),
    fileHistoryPageSize: config.get<number>(
      'fileHistoryPageSize',
      DEFAULT_FILE_HISTORY_PAGE_SIZE,
    ),
    showCommitGraph: config.get<boolean>('showCommitGraph', true),
  };
}

function parseUri(value: string): vscode.Uri {
  try {
    return vscode.Uri.parse(value, true);
  } catch (error) {
    throw new GitWorkbenchError(
      'FILE_OUTSIDE_REPOSITORY',
      `URI를 해석할 수 없습니다: ${value}`,
      true,
      { cause: error },
    );
  }
}

/** Webview가 보낸 값이 알려진 요청 형태인지 확인한다. */
function validateRequest(raw: unknown): WebviewRequest | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }

  const message = raw as Record<string, unknown>;

  if (typeof message.type !== 'string' || typeof message.requestId !== 'string') {
    return undefined;
  }

  switch (message.type) {
    case 'ping':
    case 'repository/list':
      return message as unknown as WebviewRequest;

    case 'fileHistory/load':
      return typeof message.uri === 'string' && typeof message.limit === 'number'
        ? (message as unknown as WebviewRequest)
        : undefined;

    case 'refs/load':
      return typeof message.repositoryId === 'string'
        ? (message as unknown as WebviewRequest)
        : undefined;

    case 'commitLog/search':
      return typeof message.repositoryId === 'string' &&
        typeof message.limit === 'number' &&
        typeof message.filters === 'object' &&
        message.filters !== null
        ? (message as unknown as WebviewRequest)
        : undefined;

    case 'commitDetail/load':
      return typeof message.repositoryId === 'string' &&
        typeof message.commitHash === 'string' &&
        typeof message.parentIndex === 'number'
        ? (message as unknown as WebviewRequest)
        : undefined;

    case 'diff/load':
      return typeof message.repositoryId === 'string' &&
        typeof message.commitHash === 'string' &&
        typeof message.parentIndex === 'number' &&
        typeof message.newPath === 'string' &&
        (message.mode === 'changes' || message.mode === 'full')
        ? (message as unknown as WebviewRequest)
        : undefined;

    case 'diff/openInEditor':
      return typeof message.repositoryId === 'string' &&
        typeof message.commitHash === 'string' &&
        typeof message.parentIndex === 'number' &&
        typeof message.newPath === 'string'
        ? (message as unknown as WebviewRequest)
        : undefined;

    case 'commit/cherryPick':
      return typeof message.repositoryId === 'string' &&
        typeof message.commitHash === 'string'
        ? (message as unknown as WebviewRequest)
        : undefined;

    case 'request/cancel':
      return typeof message.targetRequestId === 'string'
        ? (message as unknown as WebviewRequest)
        : undefined;

    default:
      return undefined;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)?.slice(0, 500) ?? String(value);
  } catch {
    return String(value);
  }
}
