import * as vscode from 'vscode';
import type { GitProcessRunner } from '../git/GitProcessRunner';
import type { RepositoryResolver } from '../git/RepositoryResolver';
import { assertRelativePath } from '../git/validation';

/** 저장소의 과거 파일 내용을 편집기에 보여 주기 위한 읽기 전용 스킴. */
export const GIT_WORKBENCH_SCHEME = 'git-workbench';

interface ContentRef {
  repositoryId: string;
  /** 빈 문자열이면 그 시점에 파일이 없었다는 뜻이다. 빈 문서를 보여 준다. */
  revision: string;
}

/**
 * `git-workbench:/<path>?<json>` 형태의 URI를 만든다.
 *
 * path에 실제 파일 경로를 넣어야 편집기가 언어를 알아보고 구문 강조를 한다.
 */
export function toContentUri(
  relativePath: string,
  ref: ContentRef,
): vscode.Uri {
  return vscode.Uri.from({
    scheme: GIT_WORKBENCH_SCHEME,
    path: `/${assertRelativePath(relativePath)}`,
    query: JSON.stringify(ref),
  });
}

export class GitContentProvider
  implements vscode.TextDocumentContentProvider
{
  public constructor(
    private readonly runner: GitProcessRunner,
    private readonly resolver: RepositoryResolver,
  ) {}

  public async provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken,
  ): Promise<string> {
    const ref = parseRef(uri);

    // 추가되기 전 / 삭제된 뒤의 쪽은 빈 문서로 둔다.
    if (!ref || !ref.revision) {
      return '';
    }

    const repository = this.resolver.getById(ref.repositoryId);
    const relativePath = uri.path.replace(/^\//, '');

    const result = await this.runner.run(
      repository.rootUri.fsPath,
      ['show', `${ref.revision}:${relativePath}`],
      token,
    );

    if (result.stdout.includes(0)) {
      return `Binary file (${result.stdout.length} bytes)\n${relativePath}\n${ref.revision}`;
    }

    return result.stdout.toString('utf8');
  }
}

function parseRef(uri: vscode.Uri): ContentRef | undefined {
  try {
    const parsed = JSON.parse(uri.query) as Partial<ContentRef>;

    if (typeof parsed.repositoryId !== 'string') {
      return undefined;
    }

    return {
      repositoryId: parsed.repositoryId,
      revision: typeof parsed.revision === 'string' ? parsed.revision : '',
    };
  } catch {
    return undefined;
  }
}
