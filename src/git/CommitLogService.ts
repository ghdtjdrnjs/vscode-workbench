import * as vscode from 'vscode';
import type { BranchRef, CommitSummary } from '../shared/models';
import type { CommitFilters } from '../shared/protocol';
import type { GitProcessRunner } from './GitProcessRunner';
import type { GitQueryCache } from './GitQueryCache';
import type { RepositoryResolver } from './RepositoryResolver';
import { COMMIT_FORMAT, parseCommitRecords } from './parsers/commitRecordParser';
import { REF_FORMAT, parseRefs } from './parsers/refParser';
import {
  assertFilterValue,
  assertRefName,
  clampLimit,
  parseCursor,
} from './validation';

export interface CommitLogQuery {
  repositoryId: string;
  filters: CommitFilters;
  limit: number;
  cursor?: string;
}

export interface CommitLogPage {
  commits: CommitSummary[];
  hasMore: boolean;
  nextCursor?: string;
}

export class CommitLogService {
  public constructor(
    private readonly runner: GitProcessRunner,
    private readonly resolver: RepositoryResolver,
    private readonly cache: GitQueryCache,
  ) {}

  public async loadRefs(
    repositoryId: string,
    token: vscode.CancellationToken,
  ): Promise<BranchRef[]> {
    const repository = this.resolver.getById(repositoryId);
    const cacheKey = `refs:${repositoryId}:all`;
    const cached = this.cache.get<BranchRef[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await this.runner.run(
      repository.rootUri.fsPath,
      [
        'for-each-ref',
        '--sort=-committerdate',
        `--format=${REF_FORMAT}`,
        'refs/heads',
        'refs/remotes',
        'refs/tags',
      ],
      token,
    );

    const refs = parseRefs(result.stdout, 'git for-each-ref');
    this.cache.set(cacheKey, refs, refs.length);

    return refs;
  }

  public async load(
    query: CommitLogQuery,
    token: vscode.CancellationToken,
  ): Promise<CommitLogPage> {
    const repository = this.resolver.getById(query.repositoryId);
    const limit = clampLimit(query.limit, 20, 1000);
    const skip = parseCursor(query.cursor);

    const args = ['log', '--topo-order', '--date=iso-strict'];

    if (query.filters.allRefs || !query.filters.ref) {
      args.push('--all');
    }

    if (query.filters.author) {
      args.push(`--author=${assertFilterValue('작성자', query.filters.author)}`);
    }

    if (query.filters.message) {
      args.push(
        `--grep=${assertFilterValue('커밋 메시지', query.filters.message)}`,
      );
    }

    if (query.filters.author || query.filters.message) {
      // 검색어를 정규식이 아니라 문자열 그대로 다룬다.
      args.push('--fixed-strings', '--regexp-ignore-case');
    }

    if (query.filters.since) {
      args.push(`--since=${assertFilterValue('시작 날짜', query.filters.since)}`);
    }

    if (query.filters.until) {
      args.push(`--until=${assertFilterValue('종료 날짜', query.filters.until)}`);
    }

    args.push(`--max-count=${limit + 1}`, `--format=${COMMIT_FORMAT}`);

    if (skip > 0) {
      args.push(`--skip=${skip}`);
    }

    if (!query.filters.allRefs && query.filters.ref) {
      args.push(assertRefName(query.filters.ref));
    }

    // revision과 path를 명확히 분리한다.
    args.push('--');

    const cacheKey = `commitLog:${query.repositoryId}:${filterHash(
      query.filters,
    )}:${skip}:${limit}`;
    const cached = this.cache.get<CommitLogPage>(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await this.runner.run(
      repository.rootUri.fsPath,
      args,
      token,
    );
    const records = parseCommitRecords(result.stdout, 'git log');

    const hasMore = records.length > limit;
    const commits = (hasMore ? records.slice(0, limit) : records).map(
      record => record.commit,
    );

    const page: CommitLogPage = {
      commits,
      hasMore,
      nextCursor: hasMore ? String(skip + limit) : undefined,
    };

    this.cache.set(cacheKey, page, commits.length);

    return page;
  }
}

export function filterHash(filters: CommitFilters): string {
  return [
    filters.allRefs ? 'all' : filters.ref ?? '',
    filters.author ?? '',
    filters.since ?? '',
    filters.until ?? '',
    filters.message ?? '',
  ].join('|');
}
