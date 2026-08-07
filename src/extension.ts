import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { activateGitApi } from './git/GitApiProvider';
import { GitWorkbenchViewProvider } from './panel/GitWorkbenchViewProvider';

const VIEW_ID = 'gitWorkbench.main';

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const output = vscode.window.createOutputChannel('Git Workbench');
  context.subscriptions.push(output);

  if (!vscode.workspace.isTrusted) {
    output.appendLine(
      '[activate] workspace가 신뢰되지 않아 Git Workbench를 활성화하지 않는다.',
    );
    return;
  }

  const gitApi = await activateGitApi();

  const provider = GitWorkbenchViewProvider.create({
    context,
    gitApi,
    output,
  });

  context.subscriptions.push(provider);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }),
  );

  context.subscriptions.push(...registerCommands({ provider }));

  output.appendLine('[activate] Git Workbench 준비 완료');
}

export function deactivate(): void {
  // context.subscriptions에 등록된 리소스는 VS Code가 정리한다.
}
