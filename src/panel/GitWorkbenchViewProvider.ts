import * as path from 'node:path';
import * as vscode from 'vscode';
import type { API as GitApi } from '../api/git';
import { CherryPickService } from '../git/CherryPickService';
import { CommitDetailService } from '../git/CommitDetailService';
import { CommitLogService } from '../git/CommitLogService';
import { DiffService } from '../git/DiffService';
import { FileHistoryService } from '../git/FileHistoryService';
import { GitProcessRunner } from '../git/GitProcessRunner';
import { GitQueryCache } from '../git/GitQueryCache';
import { RepositoryResolver } from '../git/RepositoryResolver';
import { resolveGitPath } from '../git/GitApiProvider';
import { assertCommitHash, assertRelativePath } from '../git/validation';
import { DEFAULT_MAX_TEXT_FILE_BYTES } from '../shared/constants';
import type { ExtensionMessage, WebviewEvent } from '../shared/protocol';
import { GitContentProvider, toContentUri } from './GitContentProvider';
import { getWebviewHtml } from './getWebviewHtml';
import { MessageRouter } from './MessageRouter';

const MAX_PENDING_NOTIFICATIONS = 16;
/** 연달아 울리는 git state 이벤트를 이 시간만큼 묶는다. */
const REPOSITORY_CHANGE_DEBOUNCE_MS = 700;

export interface ProviderOptions {
  context: vscode.ExtensionContext;
  gitApi: GitApi;
  output: vscode.OutputChannel;
}

export class GitWorkbenchViewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private view?: vscode.WebviewView;
  private router?: MessageRouter;
  private readonly disposables: vscode.Disposable[] = [];
  /**
   * Webview 스크립트가 message listener를 붙였는지.
   * `view.show()`는 view 생성까지만 기다리고 webview.js 실행까지 기다리지 않는다.
   * 준비되기 전에 postMessage하면 조용히 사라지므로 첫 수신 메시지로 판단한다.
   */
  private webviewReady = false;
  /** 준비 전에 도착한 알림. 오래된 것부터 버린다. */
  private pendingNotifications: ExtensionMessage[] = [];
  private changeTimer?: ReturnType<typeof setTimeout>;
  private lastRepositorySignature = '';

  private readonly cache: GitQueryCache;
  private readonly resolver: RepositoryResolver;
  private readonly runner: GitProcessRunner;
  private readonly fileHistory: FileHistoryService;
  private readonly commitLog: CommitLogService;
  private readonly commitDetail: CommitDetailService;
  private readonly diff: DiffService;
  private readonly cherryPick: CherryPickService;
  public readonly contentProvider: GitContentProvider;

  private constructor(private readonly options: ProviderOptions) {
    this.cache = new GitQueryCache(options.output);
    this.resolver = new RepositoryResolver(options.gitApi);
    // 경로는 실행 시점에 해석한다. 시작 시점에는 아직 준비되지 않았을 수 있다.
    this.runner = new GitProcessRunner(
      () => resolveGitPath(options.gitApi),
      options.output,
    );

    this.fileHistory = new FileHistoryService(
      this.runner,
      this.resolver,
      this.cache,
    );
    this.commitLog = new CommitLogService(this.runner, this.resolver, this.cache);
    this.commitDetail = new CommitDetailService(
      this.runner,
      this.resolver,
      this.cache,
    );
    this.diff = new DiffService(
      this.runner,
      this.resolver,
      this.cache,
      this.commitDetail,
      () =>
        vscode.workspace
          .getConfiguration('gitWorkbench')
          .get<number>('maxTextFileBytes', DEFAULT_MAX_TEXT_FILE_BYTES),
    );

    this.cherryPick = new CherryPickService(
      this.runner,
      this.resolver,
      this.cache,
    );

    this.contentProvider = new GitContentProvider(this.runner, this.resolver);

    this.subscribeToRepositoryEvents();
  }

  public static create(options: ProviderOptions): GitWorkbenchViewProvider {
    return new GitWorkbenchViewProvider(options);
  }

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.options.context.extensionUri, 'media'),
      ],
    };

    view.webview.html = getWebviewHtml(
      view.webview,
      this.options.context.extensionUri,
    );

    this.router?.dispose();
    this.router = new MessageRouter({
      resolver: this.resolver,
      fileHistory: this.fileHistory,
      commitLog: this.commitLog,
      commitDetail: this.commitDetail,
      diff: this.diff,
      cherryPick: this.cherryPick,
      openDiffInEditor: query => this.openDiffInEditor(query),
      output: this.options.output,
      post: message => {
        void view.webview.postMessage(message);
      },
    });

    // 새 webview는 스크립트를 다시 실행한다. 준비 상태를 초기화한다.
    this.webviewReady = false;

    const messageSubscription = view.webview.onDidReceiveMessage(message => {
      if (isWebviewEvent(message)) {
        this.handleWebviewEvent(message);
        return;
      }

      // 첫 메시지가 도착했다는 것은 webview의 listener가 붙었다는 뜻이다.
      if (!this.webviewReady) {
        this.webviewReady = true;
        this.flushPending();
      }

      void this.router?.handle(message);
    });

    view.onDidDispose(() => {
      messageSubscription.dispose();
      this.router?.dispose();
      this.router = undefined;
      this.view = undefined;
      this.webviewReady = false;
    });
  }

  /** editor/explorer command에서 호출한다. */
  public async showFileHistory(uri: vscode.Uri): Promise<void> {
    const repository = this.resolver.resolveUri(uri);

    await vscode.commands.executeCommand('gitWorkbench.main.focus');

    this.post({
      type: 'route/fileHistory',
      uri: uri.toString(),
      fileName: path.basename(uri.fsPath),
      repositoryName: repository.name,
    });
  }

  public async openLog(): Promise<void> {
    await vscode.commands.executeCommand('gitWorkbench.main.focus');
    this.post({ type: 'route/commitLog' });
  }

  /**
   * 변경 파일을 VS Code 기본 diff 편집기에서 연다.
   * 하단 패널은 폭이 좁아서 실제 코드를 읽기에는 편집기 영역이 낫다.
   */
  public async openDiffInEditor(query: {
    repositoryId: string;
    commitHash: string;
    parentIndex: number;
    oldPath?: string;
    newPath: string;
  }): Promise<void> {
    const repository = this.resolver.getById(query.repositoryId);
    const cwd = repository.rootUri.fsPath;
    const source = new vscode.CancellationTokenSource();

    try {
      const commitHash = assertCommitHash(query.commitHash);
      const newPath = assertRelativePath(query.newPath);
      const oldPath = query.oldPath
        ? assertRelativePath(query.oldPath)
        : newPath;

      const summary = await this.commitDetail.loadSummary(
        cwd,
        commitHash,
        source.token,
      );
      const parentIndex = Math.min(
        Math.max(0, Math.floor(query.parentIndex)),
        Math.max(0, summary.parentHashes.length - 1),
      );
      const parentHash = summary.parentHashes[parentIndex];

      // root commit이거나 추가/삭제된 파일은 한쪽이 없다. 그쪽은 빈 문서로 연다.
      const [oldExists, newExists] = await Promise.all([
        parentHash
          ? this.blobExists(cwd, parentHash, oldPath, source.token)
          : Promise.resolve(false),
        this.blobExists(cwd, commitHash, newPath, source.token),
      ]);

      const left = toContentUri(oldPath, {
        repositoryId: query.repositoryId,
        revision: oldExists && parentHash ? parentHash : '',
      });
      const right = toContentUri(newPath, {
        repositoryId: query.repositoryId,
        revision: newExists ? commitHash : '',
      });

      const label = oldPath === newPath ? newPath : `${oldPath} → ${newPath}`;
      const title = `${label} (${
        parentHash ? parentHash.slice(0, 7) : '없음'
      } ↔ ${commitHash.slice(0, 7)})`;

      await vscode.commands.executeCommand('vscode.diff', left, right, title, {
        preview: true,
      });
    } finally {
      source.dispose();
    }
  }

  private async blobExists(
    cwd: string,
    revision: string,
    relativePath: string,
    token: vscode.CancellationToken,
  ): Promise<boolean> {
    try {
      await this.runner.run(
        cwd,
        ['cat-file', '-e', `${revision}:${relativePath}`],
        token,
      );
      return true;
    } catch {
      return false;
    }
  }

  public refresh(): void {
    this.cache.clear();
    this.post({ type: 'refresh' });
  }

  /**
   * webview HTML을 다시 넣어 스크립트를 처음부터 실행한다.
   * refresh()는 살아 있는 화면에 알림만 보내므로 화면이 죽었을 때는 소용이 없다.
   * getWebviewHtml은 매번 새 nonce를 넣어 HTML이 달라지므로 VS Code가 반드시 다시 로드한다.
   */
  public reloadView(): void {
    if (!this.view) {
      void vscode.commands.executeCommand('gitWorkbench.main.focus');
      return;
    }

    this.options.output.appendLine('[webview] 화면을 다시 로드한다.');
    this.cache.clear();
    // 새 스크립트가 첫 메시지를 보낼 때까지 알림을 큐에 모은다.
    this.webviewReady = false;
    this.view.webview.html = getWebviewHtml(
      this.view.webview,
      this.options.context.extensionUri,
    );
  }

  private handleWebviewEvent(event: WebviewEvent): void {
    switch (event.type) {
      case 'webview/error':
        this.options.output.appendLine(`[webview] 오류: ${event.message}`);

        if (event.stack) {
          this.options.output.appendLine(event.stack);
        }

        if (event.componentStack) {
          this.options.output.appendLine(
            `[webview] component stack:${event.componentStack}`,
          );
        }
        break;

      case 'webview/reload':
        this.reloadView();
        break;
    }
  }

  public dispose(): void {
    this.router?.dispose();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }

    this.disposables.length = 0;
  }

  private post(message: ExtensionMessage): void {
    if (!this.view || !this.webviewReady) {
      this.pendingNotifications.push(message);

      if (this.pendingNotifications.length > MAX_PENDING_NOTIFICATIONS) {
        this.pendingNotifications.shift();
      }

      return;
    }

    void this.view.webview.postMessage(message);
  }

  private flushPending(): void {
    const queued = this.pendingNotifications;
    this.pendingNotifications = [];

    for (const message of queued) {
      void this.view?.webview.postMessage(message);
    }
  }

  private subscribeToRepositoryEvents(): void {
    // 내장 Git extension의 state.onDidChange는 파일 저장·index 갱신마다 자주 울린다.
    // 그대로 흘려보내면 webview가 매번 다시 읽어서 화면이 깜빡인다.
    // 실제로 의미 있게 바뀐 경우에만, 그것도 묶어서 한 번만 알린다.
    const notifyChange = (): void => {
      if (this.changeTimer !== undefined) {
        clearTimeout(this.changeTimer);
      }

      this.changeTimer = setTimeout(() => {
        this.changeTimer = undefined;

        const signature = this.repositorySignature();

        if (signature === this.lastRepositorySignature) {
          this.options.output.appendLine(
            '[refresh] git state 이벤트를 받았지만 바뀐 것이 없어 무시한다.',
          );
          return;
        }

        this.options.output.appendLine(
          '[refresh] repository 상태가 바뀌어 webview에 갱신을 알린다.',
        );
        this.lastRepositorySignature = signature;
        this.cache.clear();
        this.post({ type: 'repositories/changed' });
      }, REPOSITORY_CHANGE_DEBOUNCE_MS);
    };

    const watchState = (repository: {
      state: { onDidChange: vscode.Event<void> };
    }): void => {
      this.disposables.push(repository.state.onDidChange(notifyChange));
    };

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('gitWorkbench')) {
          // 설정 변경은 드물고 즉시 반영되어야 한다.
          this.cache.clear();
          this.post({ type: 'repositories/changed' });
        }
      }),
      this.options.gitApi.onDidOpenRepository(repository => {
        // 나중에 열린 repository의 checkout/commit 이벤트도 받아야 한다.
        watchState(repository);
        notifyChange();
      }),
      this.options.gitApi.onDidCloseRepository(notifyChange),
      new vscode.Disposable(() => {
        if (this.changeTimer !== undefined) {
          clearTimeout(this.changeTimer);
          this.changeTimer = undefined;
        }
      }),
    );

    for (const repository of this.options.gitApi.repositories) {
      watchState(repository);
    }

    this.lastRepositorySignature = this.repositorySignature();
  }

  /**
   * 화면을 다시 그릴 이유가 되는 값만 모은다.
   * 저장소 목록, 현재 branch, HEAD commit이 그대로면 알리지 않는다.
   */
  private repositorySignature(): string {
    return this.options.gitApi.repositories
      .map(repository =>
        [
          repository.rootUri.toString(),
          repository.state.HEAD?.name ?? '',
          repository.state.HEAD?.commit ?? '',
        ].join('|'),
      )
      .sort()
      .join('\n');
  }
}

function isWebviewEvent(message: unknown): message is WebviewEvent {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const type = (message as { type?: unknown }).type;
  return type === 'webview/error' || type === 'webview/reload';
}
