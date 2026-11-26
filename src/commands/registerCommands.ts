import * as vscode from 'vscode';
import type { GitWorkbenchViewProvider } from '../panel/GitWorkbenchViewProvider';
import { GitWorkbenchError, toGitWorkbenchError } from '../shared/errors';

export interface RegisterCommandsOptions {
  provider: GitWorkbenchViewProvider;
}

export function registerCommands(
  options: RegisterCommandsOptions,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      'gitWorkbench.showFileHistory',
      async (resourceUri?: vscode.Uri) => {
        try {
          const uri = resolveTargetUri(resourceUri);
          await options.provider.showFileHistory(uri);
        } catch (error) {
          showError(error);
        }
      },
    ),

    vscode.commands.registerCommand('gitWorkbench.openLog', async () => {
      try {
        await options.provider.openLog();
      } catch (error) {
        showError(error);
      }
    }),

    vscode.commands.registerCommand('gitWorkbench.refresh', () => {
      options.provider.refresh();
    }),

    vscode.commands.registerCommand('gitWorkbench.reloadView', () => {
      options.provider.reloadView();
    }),
  ];
}

/**
 * Explorer가 넘긴 URI를 우선 사용하고, 없으면 active editor로 대체한다.
 * 저장되지 않은 문서(untitled)나 file scheme이 아닌 문서는 명확히 거부한다.
 */
function resolveTargetUri(resourceUri?: vscode.Uri): vscode.Uri {
  const uri = resourceUri ?? vscode.window.activeTextEditor?.document.uri;

  if (!uri) {
    throw new GitWorkbenchError(
      'FILE_OUTSIDE_REPOSITORY',
      '이력을 볼 파일을 찾지 못했습니다. 파일을 열거나 Explorer에서 선택하세요.',
    );
  }

  if (uri.scheme === 'untitled') {
    throw new GitWorkbenchError(
      'FILE_OUTSIDE_REPOSITORY',
      '저장되지 않은 문서는 Git 이력을 조회할 수 없습니다. 먼저 파일을 저장하세요.',
    );
  }

  if (uri.scheme !== 'file') {
    throw new GitWorkbenchError(
      'FILE_OUTSIDE_REPOSITORY',
      `${uri.scheme} 문서는 Git 이력을 조회할 수 없습니다.`,
    );
  }

  return uri;
}

function showError(error: unknown): void {
  const wrapped = toGitWorkbenchError(error);
  void vscode.window.showWarningMessage(`Git Workbench: ${wrapped.message}`);
}
