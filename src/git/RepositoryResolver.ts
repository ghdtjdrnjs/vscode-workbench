import { createHash } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { API as GitApi, Repository } from '../api/git';
import { GitWorkbenchError } from '../shared/errors';
import type { RepositoryInfo } from '../shared/models';

export interface ResolvedRepository {
  id: string;
  rootUri: vscode.Uri;
  name: string;
  gitRepository: Repository;
}

/** macOS/Windows는 기본적으로 대소문자를 구분하지 않는다. */
const CASE_INSENSITIVE_FS =
  process.platform === 'darwin' || process.platform === 'win32';

export function repositoryIdOf(rootUri: vscode.Uri): string {
  return createHash('sha1').update(rootUri.toString()).digest('hex').slice(0, 12);
}

export class RepositoryResolver {
  public constructor(private readonly gitApi: GitApi) {}

  public list(): ResolvedRepository[] {
    return this.gitApi.repositories.map(repository => this.wrap(repository));
  }

  public listInfo(): RepositoryInfo[] {
    return this.list().map(repository => ({
      id: repository.id,
      rootUri: repository.rootUri.toString(),
      name: repository.name,
      headName: repository.gitRepository.state.HEAD?.name,
      headCommit: repository.gitRepository.state.HEAD?.commit,
    }));
  }

  public getById(repositoryId: string): ResolvedRepository {
    const found = this.list().find(repository => repository.id === repositoryId);

    if (!found) {
      throw new GitWorkbenchError(
        'REPOSITORY_NOT_FOUND',
        `Repository ${repositoryId} is no longer open.`,
      );
    }

    return found;
  }

  /**
   * URI가 속한 repository를 찾는다.
   * multi-root workspace에서는 가장 깊게 일치하는 repository를 고른다.
   */
  public resolveUri(uri: vscode.Uri): ResolvedRepository {
    if (uri.scheme !== 'file') {
      throw new GitWorkbenchError(
        'FILE_OUTSIDE_REPOSITORY',
        `저장되지 않은 문서(${uri.scheme})는 Git 이력을 조회할 수 없습니다.`,
      );
    }

    const candidates = this.list()
      .filter(repository => containsPath(repository.rootUri.fsPath, uri.fsPath))
      .sort((a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length);

    const best = candidates[0];

    if (!best) {
      // 내장 Git API가 아직 repository를 열지 못했을 수 있으므로 한 번 더 물어본다.
      const fallback = this.gitApi.getRepository(uri);

      if (fallback) {
        return this.wrap(fallback);
      }

      throw new GitWorkbenchError(
        'FILE_OUTSIDE_REPOSITORY',
        '선택한 파일은 Git 저장소에 포함되어 있지 않습니다.',
      );
    }

    return best;
  }

  /** repository root 기준 상대 경로를 Git이 쓰는 `/` 구분자로 반환한다. */
  public relativePathOf(repository: ResolvedRepository, uri: vscode.Uri): string {
    const relative = path.relative(repository.rootUri.fsPath, uri.fsPath);

    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new GitWorkbenchError(
        'FILE_OUTSIDE_REPOSITORY',
        '선택한 파일은 Git 저장소에 포함되어 있지 않습니다.',
      );
    }

    return relative.split(path.sep).join('/');
  }

  private wrap(repository: Repository): ResolvedRepository {
    return {
      id: repositoryIdOf(repository.rootUri),
      rootUri: repository.rootUri,
      name: path.basename(repository.rootUri.fsPath),
      gitRepository: repository,
    };
  }
}

function containsPath(root: string, target: string): boolean {
  const normalizedRoot = normalize(root);
  const normalizedTarget = normalize(target);

  if (normalizedTarget === normalizedRoot) {
    return true;
  }

  return normalizedTarget.startsWith(
    normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep,
  );
}

function normalize(value: string): string {
  const resolved = path.resolve(value);
  return CASE_INSENSITIVE_FS ? resolved.toLowerCase() : resolved;
}
