import * as vscode from 'vscode';
import type { API as GitApi, GitExtension } from '../api/git';
import { GitWorkbenchError } from '../shared/errors';

/** 내장 Git extension을 활성화하고 API를 얻는다. */
export async function activateGitApi(): Promise<GitApi> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');

  if (!extension) {
    throw new GitWorkbenchError(
      'GIT_NOT_FOUND',
      'VS Code built-in Git extension is unavailable.',
      false,
    );
  }

  const exports = await extension.activate();

  if (!exports.enabled) {
    throw new GitWorkbenchError(
      'GIT_NOT_FOUND',
      'VS Code built-in Git extension is disabled.',
      false,
    );
  }

  return exports.getAPI(1);
}

export function resolveGitPath(api: GitApi): string {
  const path = api.git?.path;

  if (!path) {
    throw new GitWorkbenchError(
      'GIT_NOT_FOUND',
      'Git executable path is not available from the built-in Git extension.',
      false,
    );
  }

  return path;
}
