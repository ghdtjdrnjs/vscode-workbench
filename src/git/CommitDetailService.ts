import * as vscode from 'vscode';
import { GitWorkbenchError } from '../shared/errors';
import type {
  BranchRef,
  ChangedFile,
  CommitDetail,
  CommitSummary,
} from '../shared/models';
import type { GitProcessRunner } from './GitProcessRunner';
import type { GitQueryCache } from './GitQueryCache';
import type { RepositoryResolver } from './RepositoryResolver';
import { COMMIT_FORMAT, parseCommitRecords } from './parsers/commitRecordParser';
import { parseNameStatusOutput } from './parsers/nameStatusParser';
import { REF_FORMAT, parseRefs } from './parsers/refParser';
import { assertCommitHash } from './validation';

export interface CommitDetailQuery {
  repositoryId: string;
  commitHash: string;
  parentIndex: number;
}

export class CommitDetailService {
  public constructor(
    private readonly runner: GitProcessRunner,
    private readonly resolver: RepositoryResolver,
    private readonly cache: GitQueryCache,
  ) {}

  public async load(
    query: CommitDetailQuery,
    token: vscode.CancellationToken,
  ): Promise<CommitDetail> {
    const repository = this.resolver.getById(query.repositoryId);
    const commitHash = assertCommitHash(query.commitHash);
    const cwd = repository.rootUri.fsPath;

    const summary = await this.loadSummary(cwd, commitHash, token);
    const parentIndex = Math.min(
      Math.max(0, Math.floor(query.parentIndex)),
      Math.max(0, summary.parentHashes.length - 1),
    );

    const [changedFiles, containingBranches] = await Promise.all([
      this.loadChangedFiles(
        cwd,
        commitHash,
        summary.parentHashes[parentIndex],
        token,
      ),
      this.loadContainingBranches(cwd, query.repositoryId, commitHash, token),
    ]);

    return {
      ...summary,
      parentIndex,
      changedFiles,
      containingBranches,
    };
  }

  public async loadSummary(
    cwd: string,
    commitHash: string,
    token: vscode.CancellationToken,
  ): Promise<CommitSummary> {
    const cacheKey = `commitSummary:${cwd}:${commitHash}`;
    const cached = this.cache.get<CommitSummary>(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await this.runner.run(
      cwd,
      [
        'show',
        '--no-patch',
        '--date=iso-strict',
        `--format=${COMMIT_FORMAT}`,
        commitHash,
      ],
      token,
    );

    const records = parseCommitRecords(result.stdout, 'git show --no-patch');
    const record = records[0];

    if (!record) {
      throw new GitWorkbenchError(
        'OBJECT_NOT_FOUND',
        `commit ${commitHash}의 정보를 읽지 못했습니다.`,
      );
    }

    this.cache.set(cacheKey, record.commit, 1);

    return record.commit;
  }

  public async loadChangedFiles(
    cwd: string,
    commitHash: string,
    parentHash: string | undefined,
    token: vscode.CancellationToken,
  ): Promise<ChangedFile[]> {
    const cacheKey = `changedFiles:${cwd}:${commitHash}:${parentHash ?? 'root'}`;
    const cached = this.cache.get<ChangedFile[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const args = parentHash
      ? [
          'diff',
          '--name-status',
          '-M',
          '-C',
          '-z',
          parentHash,
          commitHash,
        ]
      : [
          // root commit은 parent가 없어 diff-tree --root로 분기한다.
          'diff-tree',
          '--root',
          '--no-commit-id',
          '--name-status',
          '-r',
          '-M',
          '-C',
          '-z',
          commitHash,
        ];

    const result = await this.runner.run(cwd, args, token);
    const files = parseNameStatusOutput(
      result.stdout,
      parentHash ? 'git diff --name-status' : 'git diff-tree --root',
    );

    this.cache.set(cacheKey, files, files.length);

    return files;
  }

  public async loadContainingBranches(
    cwd: string,
    repositoryId: string,
    commitHash: string,
    token: vscode.CancellationToken,
  ): Promise<BranchRef[]> {
    const cacheKey = `containing:${repositoryId}:${commitHash}`;
    const cached = this.cache.get<BranchRef[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await this.runner.run(
      cwd,
      [
        'for-each-ref',
        `--contains=${commitHash}`,
        `--format=${REF_FORMAT}`,
        'refs/heads',
        'refs/remotes',
      ],
      token,
    );

    const refs = parseRefs(result.stdout, 'git for-each-ref --contains').filter(
      ref => !ref.isSymbolic,
    );

    this.cache.set(cacheKey, refs, refs.length);

    return refs;
  }
}
