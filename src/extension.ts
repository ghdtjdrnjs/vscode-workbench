import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { activateGitApi } from './git/GitApiProvider';
import { GitWorkbenchError, toGitWorkbenchError } from './shared/errors';
import { GIT_WORKBENCH_SCHEME } from './panel/GitContentProvider';
import { GitWorkbenchViewProvider } from './panel/GitWorkbenchViewProvider';
import { MessageViewProvider } from './panel/MessageViewProvider';

const VIEW_ID = 'gitWorkbench.main';

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const output = vscode.window.createOutputChannel('Git Workbench');
  context.subscriptions.push(output);
  output.appendLine('[activate] 시작');

  try {
    if (!vscode.workspace.isTrusted) {
      throw new GitWorkbenchError(
        'UNSUPPORTED_WORKSPACE',
        '이 workspace를 신뢰하지 않아 Git 명령을 실행할 수 없습니다. ' +
          '워크스페이스를 신뢰로 전환한 뒤 창을 다시 로드하세요.',
        false,
      );
    }

    const gitApi = await activateGitApi();

    const provider = GitWorkbenchViewProvider.create({
      context,
      gitApi,
      output,
    });

    context.subscriptions.push(provider);

    // 과거 파일 내용을 편집기에 띄우기 위한 읽기 전용 스킴.
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        GIT_WORKBENCH_SCHEME,
        provider.contentProvider,
      ),
    );

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }),
    );

    context.subscriptions.push(...registerCommands({ provider }));
    context.subscriptions.push(createStatusBarItem());

    output.appendLine('[activate] Git Workbench 준비 완료');
  } catch (error) {
    // 여기서 그냥 빠져나가면 패널이 탭만 남고 완전히 비어 버린다.
    // 원인을 화면에 남기는 것이 아무것도 없는 것보다 낫다.
    const wrapped = toGitWorkbenchError(error);
    output.appendLine(`[activate] 실패: ${wrapped.code} ${wrapped.message}`);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        VIEW_ID,
        new MessageViewProvider(
          'Git Workbench를 시작하지 못했습니다',
          wrapped.message,
        ),
      ),
    );

    watchForTrust(context, output);
  }
}

/**
 * 신뢰하지 않은 상태로 시작했다가 나중에 신뢰로 바뀌는 경우가 흔하다.
 * 그때는 창을 다시 로드해야 확장이 제대로 붙는다.
 */
function watchForTrust(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): void {
  if (vscode.workspace.isTrusted) {
    return;
  }

  context.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      output.appendLine('[activate] workspace가 신뢰로 바뀌었다.');

      void vscode.window
        .showInformationMessage(
          'Git Workbench를 사용하려면 창을 다시 로드해야 합니다.',
          '창 다시 로드',
        )
        .then(choice => {
          if (choice === '창 다시 로드') {
            void vscode.commands.executeCommand(
              'workbench.action.reloadWindow',
            );
          }
        });
    }),
  );
}

/**
 * 상태 표시줄 왼쪽 버튼. IntelliJ의 좌측 하단 Git 툴윈도우 버튼에 해당한다.
 * VS Code의 Panel view container는 하단 탭으로만 노출되고
 * 왼쪽 가장자리에 버튼을 둘 수 없어서, 진입점을 여기에 만든다.
 */
function createStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );

  item.text = '$(git-branch) Git Workbench';
  item.tooltip = 'Git Workbench 열기 (전체 커밋 로그)';
  item.command = 'gitWorkbench.openLog';
  item.show();

  return item;
}

export function deactivate(): void {
  // context.subscriptions에 등록된 리소스는 VS Code가 정리한다.
}
