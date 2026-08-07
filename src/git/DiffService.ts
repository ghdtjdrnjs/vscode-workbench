import * as vscode from 'vscode';
import {
  EMPTY_TREE_HASH,
  MAX_FULL_DIFF_LINES,
} from '../shared/constants';
import { GitWorkbenchError } from '../shared/errors';
import type {
  ChangeStatus,
  DiffFileVersion,
  DiffModel,
} from '../shared/models';
import type { CommitDetailService } from './CommitDetailService';
import type { GitProcessRunner } from './GitProcessRunner';
import type { GitQueryCache } from './GitQueryCache';
import type { RepositoryResolver } from './RepositoryResolver';
import { parsePatch } from './parsers/patchParser';
import { assertCommitHash, assertRelativePath } from './validation';

export interface DiffQuery {
  repositoryId: string;
  commitHash: string;
  parentIndex: number;
  oldPath?: string;
  newPath: string;
  mode: 'changes' | 'full';
}

export class DiffService {
  public constructor(
    private readonly runner: GitProcessRunner,
    private readonly resolver: RepositoryResolver,
    private readonly cache: GitQueryCache,
    private readonly commitDetail: CommitDetailService,
    private readonly maxTextFileBytes: () => number,
  ) {}

  public async load(
    query: DiffQuery,
    token: vscode.CancellationToken,
  ): Promise<DiffModel> {
    const repository = this.resolver.getById(query.repositoryId);
    const cwd = repository.rootUri.fsPath;
    const commitHash = assertCommitHash(query.commitHash);
    const newPath = assertRelativePath(query.newPath);
    const oldPath = query.oldPath
      ? assertRelativePath(query.oldPath)
      : undefined;

    const summary = await this.commitDetail.loadSummary(cwd, commitHash, token);
    const parentIndex = Math.min(
      Math.max(0, Math.floor(query.parentIndex)),
      Math.max(0, summary.parentHashes.length - 1),
    );
    const parentHash = summary.parentHashes[parentIndex];
    // root commit은 비교 대상이 없으므로 빈 tree와 비교한다.
    const fromRevision = parentHash ?? EMPTY_TREE_HASH;

    const patchKey = `diff:${query.repositoryId}:${commitHash}:${parentIndex}:${
      oldPath ?? ''
    }:${newPath}`;

    let base = this.cache.get<DiffModel>(patchKey);

    if (!base) {
      base = await this.loadPatch(
        cwd,
        query.repositoryId,
        commitHash,
        parentIndex,
        fromRevision,
        oldPath,
        newPath,
        token,
      );
      this.cache.set(patchKey, base, countLines(base));
    }

    if (query.mode === 'changes' || !base.fullViewAvailable) {
      return base;
    }

    return this.withFullText(cwd, base, fromRevision, commitHash, token);
  }

  private async loadPatch(
    cwd: string,
    repositoryId: string,
    commitHash: string,
    parentIndex: number,
    fromRevision: string,
    oldPath: string | undefined,
    newPath: string,
    token: vscode.CancellationToken,
  ): Promise<DiffModel> {
    const paths =
      oldPath && oldPath !== newPath ? [oldPath, newPath] : [newPath];

    const result = await this.runner.run(
      cwd,
      [
        'diff',
        '--unified=3',
        '--no-ext-diff',
        '--no-textconv',
        '-M',
        fromRevision,
        commitHash,
        '--',
        ...paths,
      ],
      token,
    );

    const parsed = parsePatch(
      result.stdout.toString('utf8'),
      'git diff --unified=3',
    );

    const status = deriveStatus(parsed.isNewFile, parsed.isDeletedFile, oldPath, newPath);
    const oldExists = status !== 'A';
    const newExists = status !== 'D';

    const oldFile: DiffFileVersion = {
      revision: oldExists ? fromRevision : undefined,
      path: oldExists ? oldPath ?? newPath : undefined,
      exists: oldExists,
    };
    const newFile: DiffFileVersion = {
      revision: newExists ? commitHash : undefined,
      path: newExists ? newPath : undefined,
      exists: newExists,
    };

    const [oldSize, newSize] = await Promise.all([
      oldExists && !parsed.binary
        ? this.objectSize(cwd, oldFile.revision!, oldFile.path!, token)
        : Promise.resolve(undefined),
      newExists && !parsed.binary
        ? this.objectSize(cwd, newFile.revision!, newFile.path!, token)
        : Promise.resolve(undefined),
    ]);

    oldFile.size = oldSize;
    newFile.size = newSize;

    const limit = this.maxTextFileBytes();
    const tooLarge =
      (oldSize !== undefined && oldSize > limit) ||
      (newSize !== undefined && newSize > limit);

    return {
      repositoryId,
      commitHash,
      parentIndex,
      oldFile,
      newFile,
      status,
      hunks: parsed.hunks,
      binary: parsed.binary,
      truncated: result.truncated,
      truncationReason: result.truncated
        ? 'patch 출력이 너무 커서 일부만 표시합니다.'
        : tooLarge
          ? `파일 크기가 전체 보기 제한(${Math.round(limit / 1024 / 1024)}MB)을 초과했습니다.`
          : undefined,
      fullViewAvailable: !parsed.binary && !tooLarge && !result.truncated,
    };
  }

  private async withFullText(
    cwd: string,
    base: DiffModel,
    fromRevision: string,
    commitHash: string,
    token: vscode.CancellationToken,
  ): Promise<DiffModel> {
    const [oldText, newText] = await Promise.all([
      base.oldFile.exists && base.oldFile.path
        ? this.readBlob(cwd, fromRevision, base.oldFile.path, token)
        : Promise.resolve(''),
      base.newFile.exists && base.newFile.path
        ? this.readBlob(cwd, commitHash, base.newFile.path, token)
        : Promise.resolve(''),
    ]);

    const totalLines =
      countTextLines(oldText) + countTextLines(newText);

    if (totalLines > MAX_FULL_DIFF_LINES) {
      return {
        ...base,
        fullViewAvailable: false,
        truncationReason: `전체 보기 줄 수 제한(${MAX_FULL_DIFF_LINES.toLocaleString()}줄)을 초과했습니다.`,
      };
    }

    return {
      ...base,
      oldFile: { ...base.oldFile, text: oldText },
      newFile: { ...base.newFile, text: newText },
    };
  }

  private async objectSize(
    cwd: string,
    revision: string,
    path: string,
    token: vscode.CancellationToken,
  ): Promise<number | undefined> {
    try {
      const text = await this.runner.runText(
        cwd,
        ['cat-file', '-s', `${revision}:${path}`],
        token,
      );
      const size = Number(text.trim());
      return Number.isFinite(size) ? size : undefined;
    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        throw error;
      }
      // 해당 revision에 파일이 없을 수 있다. 크기를 모르는 것으로 둔다.
      return undefined;
    }
  }

  private async readBlob(
    cwd: string,
    revision: string,
    path: string,
    token: vscode.CancellationToken,
  ): Promise<string> {
    const result = await this.runner.run(
      cwd,
      ['show', `${revision}:${path}`],
      token,
      { maxStdoutBytes: this.maxTextFileBytes() },
    );

    if (result.truncated) {
      throw new GitWorkbenchError(
        'FILE_TOO_LARGE',
        `${path}의 크기가 전체 보기 제한을 초과했습니다.`,
      );
    }

    if (result.stdout.includes(0)) {
      throw new GitWorkbenchError(
        'BINARY_FILE',
        `${path}은 binary 파일입니다.`,
      );
    }

    return result.stdout.toString('utf8');
  }
}

function deriveStatus(
  isNewFile: boolean,
  isDeletedFile: boolean,
  oldPath: string | undefined,
  newPath: string,
): ChangeStatus {
  if (isNewFile) {
    return 'A';
  }

  if (isDeletedFile) {
    return 'D';
  }

  if (oldPath && oldPath !== newPath) {
    return 'R';
  }

  return 'M';
}

function countLines(diff: DiffModel): number {
  return diff.hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
}

function countTextLines(text: string): number {
  if (text === '') {
    return 0;
  }

  let count = 1;

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      count += 1;
    }
  }

  return count;
}
