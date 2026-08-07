import * as vscode from 'vscode';
import type {
  ChangedFile,
  FileHistoryEntry,
  FileHistoryResult,
} from '../shared/models';
import type { GitQueryCache } from './GitQueryCache';
import type { GitProcessRunner } from './GitProcessRunner';
import type { RepositoryResolver } from './RepositoryResolver';
import { COMMIT_FORMAT, parseCommitRecords } from './parsers/commitRecordParser';
import {
  clampLimit,
  encodeFileHistoryCursor,
  parseFileHistoryCursor,
} from './validation';

export interface LoadFileHistoryInput {
  uri: vscode.Uri;
  limit: number;
  cursor?: string;
}

export class FileHistoryService {
  public constructor(
    private readonly runner: GitProcessRunner,
    private readonly resolver: RepositoryResolver,
    private readonly cache: GitQueryCache,
  ) {}

  public async load(
    input: LoadFileHistoryInput,
    token: vscode.CancellationToken,
  ): Promise<FileHistoryResult> {
    const repository = this.resolver.resolveUri(input.uri);
    const relativePath = this.resolver.relativePathOf(repository, input.uri);
    const limit = clampLimit(input.limit, 20, 500);
    const cursor = parseFileHistoryCursor(input.cursor);

    // cursor가 있으면 그 커밋을 시작 revision으로 삼고, 그 시점의 경로로 조회한다.
    const queryPath = cursor?.path ?? relativePath;

    const cacheKey = `fileHistory:${repository.id}:${queryPath}:${
      cursor?.hash ?? 'head'
    }:${limit}`;
    const cached = this.cache.get<FileHistoryResult>(cacheKey);

    if (cached) {
      return { ...cached, requestedUri: input.uri.toString() };
    }

    const args = [
      'log',
      '--follow',
      '--date=iso-strict',
      '--name-status',
      '-M',
      '-z',
      `--format=${COMMIT_FORMAT}`,
      // hasMore 판정과 다음 cursor 계산을 위해 한 건 더 읽는다.
      `--max-count=${limit + 1}`,
    ];

    if (cursor) {
      args.push(cursor.hash);
    }

    args.push('--', queryPath);

    const result = await this.runner.run(
      repository.rootUri.fsPath,
      args,
      token,
    );
    const records = parseCommitRecords(result.stdout, 'git log --follow');

    // 마지막 한 건까지 포함해서 경로를 추적한 뒤 잘라 낸다.
    // 다음 페이지의 시작 경로가 그 한 건에서 나오기 때문이다.
    const allEntries: FileHistoryEntry[] = [];
    let trackedPath = queryPath;

    for (const record of records) {
      const file = pickTrackedFile(record.changedFiles, trackedPath);

      allEntries.push({
        ...record.commit,
        pathAtCommit: file?.newPath ?? trackedPath,
        previousPath: file?.oldPath,
        status: file?.status,
      });

      // rename/copy를 만나면 그 이전 commit들은 예전 경로를 쓴다.
      if (file && (file.status === 'R' || file.status === 'C') && file.oldPath) {
        trackedPath = file.oldPath;
      }
    }

    const hasMore = allEntries.length > limit;
    const entries = hasMore ? allEntries.slice(0, limit) : allEntries;
    const next = hasMore ? allEntries[limit] : undefined;

    const historyResult: FileHistoryResult = {
      repository: {
        id: repository.id,
        rootUri: repository.rootUri.toString(),
        name: repository.name,
        headName: repository.gitRepository.state.HEAD?.name,
        headCommit: repository.gitRepository.state.HEAD?.commit,
      },
      requestedUri: input.uri.toString(),
      relativePath,
      entries,
      hasMore,
      nextCursor: next
        ? encodeFileHistoryCursor(next.hash, next.pathAtCommit)
        : undefined,
    };

    this.cache.set(cacheKey, historyResult, entries.length);

    return historyResult;
  }
}

/**
 * `--follow` 결과의 name-status에서 지금 추적 중인 경로에 해당하는 항목을 고른다.
 * rename commit에서는 newPath가 추적 경로와 일치한다.
 */
function pickTrackedFile(
  files: readonly ChangedFile[],
  trackedPath: string,
): ChangedFile | undefined {
  if (files.length === 0) {
    return undefined;
  }

  return (
    files.find(file => file.newPath === trackedPath) ??
    files.find(file => file.oldPath === trackedPath) ??
    files[0]
  );
}
