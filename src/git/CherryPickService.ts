import * as vscode from 'vscode';
import { GitWorkbenchError } from '../shared/errors';
import type { GitProcessRunner } from './GitProcessRunner';
import type { GitQueryCache } from './GitQueryCache';
import type { RepositoryResolver } from './RepositoryResolver';
import { assertCommitHash } from './validation';

export type CherryPickStatus = 'applied' | 'conflict' | 'empty';

export interface CherryPickOutcome {
  status: CherryPickStatus;
  commitHash: string;
  subject: string;
  message: string;
}

/**
 * 이 확장에서 유일하게 저장소를 변경하는 기능이다.
 * 나머지는 모두 조회 전용이므로, 여기서만 사전 조건을 엄격하게 확인한다.
 */
export class CherryPickService {
  public constructor(
    private readonly runner: GitProcessRunner,
    private readonly resolver: RepositoryResolver,
    private readonly cache: GitQueryCache,
  ) {}

  /** 확인 대화상자에 보여 줄 커밋 제목. */
  public async describe(
    repositoryId: string,
    commitHash: string,
    token: vscode.CancellationToken,
  ): Promise<string> {
    const repository = this.resolver.getById(repositoryId);
    const hash = assertCommitHash(commitHash);

    const subject = await this.runner.runText(
      repository.rootUri.fsPath,
      ['show', '--no-patch', '--format=%s', hash],
      token,
    );

    return subject.trim();
  }

  public async run(
    repositoryId: string,
    commitHash: string,
    token: vscode.CancellationToken,
  ): Promise<CherryPickOutcome> {
    const repository = this.resolver.getById(repositoryId);
    const cwd = repository.rootUri.fsPath;
    const hash = assertCommitHash(commitHash);
    const subject = await this.describe(repositoryId, hash, token);

    // 순서가 중요하다. 충돌로 멈춰 있으면 작업 트리도 더러운 상태라서,
    // dirty 검사를 먼저 하면 덜 구체적인 오류로 덮인다.
    await this.assertNoSequencerInProgress(cwd, token);
    await this.assertCleanWorkingTree(cwd, token);

    try {
      await this.runner.run(cwd, ['cherry-pick', hash], token);
    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        throw error;
      }

      // cherry-pick이 멈춘 이유를 구분한다. 충돌이면 사용자가 이어서 처리해야 한다.
      if (await this.isCherryPickInProgress(cwd, token)) {
        return {
          status: 'conflict',
          commitHash: hash,
          subject,
          message:
            '충돌이 발생해 cherry-pick이 멈췄습니다. 소스 제어에서 충돌을 해결한 뒤 ' +
            '`git cherry-pick --continue`로 이어가거나 `git cherry-pick --abort`로 되돌리세요.',
        };
      }

      const detail = error instanceof Error ? error.message : String(error);

      // 변경 사항이 이미 반영되어 있으면 git이 빈 커밋이라고 알린다.
      if (/empty|nothing to commit/i.test(detail)) {
        return {
          status: 'empty',
          commitHash: hash,
          subject,
          message:
            '이 커밋의 변경 내용이 현재 브랜치에 이미 반영되어 있어 적용하지 않았습니다.',
        };
      }

      throw error;
    } finally {
      this.cache.clear();
    }

    return {
      status: 'applied',
      commitHash: hash,
      subject,
      message: `${hash.slice(0, 7)} ${subject} 를 현재 브랜치에 적용했습니다.`,
    };
  }

  /**
   * 커밋되지 않은 변경이 있으면 cherry-pick이 중간에 실패하거나
   * 사용자의 작업과 섞인다. 미리 막는다.
   */
  private async assertCleanWorkingTree(
    cwd: string,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const status = await this.runner.runText(
      cwd,
      ['status', '--porcelain', '--untracked-files=no'],
      token,
    );

    if (status.trim() !== '') {
      throw new GitWorkbenchError(
        'WORKING_TREE_DIRTY',
        '커밋되지 않은 변경이 있어 cherry-pick을 시작할 수 없습니다. ' +
          '먼저 커밋하거나 stash하세요.',
      );
    }
  }

  private async assertNoSequencerInProgress(
    cwd: string,
    token: vscode.CancellationToken,
  ): Promise<void> {
    if (await this.isCherryPickInProgress(cwd, token)) {
      throw new GitWorkbenchError(
        'CHERRY_PICK_CONFLICT',
        '이미 진행 중인 cherry-pick이 있습니다. ' +
          '`git cherry-pick --continue` 또는 `--abort`로 먼저 마무리하세요.',
      );
    }
  }

  private async isCherryPickInProgress(
    cwd: string,
    token: vscode.CancellationToken,
  ): Promise<boolean> {
    try {
      // CHERRY_PICK_HEAD가 있으면 sequencer가 멈춰 있는 상태다.
      await this.runner.run(
        cwd,
        ['rev-parse', '--verify', '--quiet', 'CHERRY_PICK_HEAD'],
        token,
      );
      return true;
    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        throw error;
      }
      return false;
    }
  }
}
