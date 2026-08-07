import * as path from 'node:path';
import * as vscode from 'vscode';
import type { API as GitApi } from '../api/git';
import { CommitDetailService } from '../git/CommitDetailService';
import { CommitLogService } from '../git/CommitLogService';
import { DiffService } from '../git/DiffService';
import { FileHistoryService } from '../git/FileHistoryService';
import { GitProcessRunner } from '../git/GitProcessRunner';
import { GitQueryCache } from '../git/GitQueryCache';
import { RepositoryResolver } from '../git/RepositoryResolver';
import { resolveGitPath } from '../git/GitApiProvider';
import { DEFAULT_MAX_TEXT_FILE_BYTES } from '../shared/constants';
import type { ExtensionMessage } from '../shared/protocol';
import { getWebviewHtml } from './getWebviewHtml';
import { MessageRouter } from './MessageRouter';

const MAX_PENDING_NOTIFICATIONS = 16;

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

  private readonly cache: GitQueryCache;
  private readonly resolver: RepositoryResolver;
  private readonly runner: GitProcessRunner;
  private readonly fileHistory: FileHistoryService;
  private readonly commitLog: CommitLogService;
  private readonly commitDetail: CommitDetailService;
  private readonly diff: DiffService;

  private constructor(private readonly options: ProviderOptions) {
    this.cache = new GitQueryCache(options.output);
    this.resolver = new RepositoryResolver(options.gitApi);
    this.runner = new GitProcessRunner(
      resolveGitPath(options.gitApi),
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
      output: this.options.output,
      post: message => {
        void view.webview.postMessage(message);
      },
    });

    // 새 webview는 스크립트를 다시 실행한다. 준비 상태를 초기화한다.
    this.webviewReady = false;

    const messageSubscription = view.webview.onDidReceiveMessage(message => {
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

  public refresh(): void {
    this.cache.clear();
    this.post({ type: 'refresh' });
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
    const notifyChange = (): void => {
      this.cache.clear();
      this.post({ type: 'repositories/changed' });
    };

    const watchState = (repository: { state: { onDidChange: vscode.Event<void> } }): void => {
      this.disposables.push(repository.state.onDidChange(notifyChange));
    };

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('gitWorkbench')) {
          notifyChange();
        }
      }),
      this.options.gitApi.onDidOpenRepository(repository => {
        // 나중에 열린 repository의 checkout/commit 이벤트도 받아야 한다.
        watchState(repository);
        notifyChange();
      }),
      this.options.gitApi.onDidCloseRepository(notifyChange),
    );

    for (const repository of this.options.gitApi.repositories) {
      watchState(repository);
    }
  }
}
