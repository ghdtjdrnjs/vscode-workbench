import type {
  BranchRef,
  CommitDetail,
  CommitSummary,
  DiffModel,
  FileHistoryResult,
  RepositoryInfo,
} from '../src/shared/models';
import type {
  CommitFilters,
  ExtensionResponse,
  WorkbenchSettings,
} from '../src/shared/protocol';
import { request } from './vscode';

type Response<T extends ExtensionResponse['type']> = Extract<
  ExtensionResponse,
  { type: T }
>;

export async function ping(): Promise<void> {
  await request<Response<'pong'>>({ type: 'ping' });
}

export async function listRepositories(): Promise<{
  repositories: RepositoryInfo[];
  settings: WorkbenchSettings;
}> {
  const response = await request<Response<'repository/listResult'>>({
    type: 'repository/list',
  });
  return {
    repositories: response.repositories,
    settings: response.settings,
  };
}

export async function loadFileHistory(input: {
  uri: string;
  limit: number;
  cursor?: string;
}): Promise<FileHistoryResult> {
  const response = await request<Response<'fileHistory/result'>>(
    { type: 'fileHistory/load', ...input },
    'fileHistory',
  );
  return response.result;
}

export async function loadRefs(repositoryId: string): Promise<BranchRef[]> {
  const response = await request<Response<'refs/result'>>(
    { type: 'refs/load', repositoryId },
    'refs',
  );
  return response.refs;
}

export async function loadCommitLog(input: {
  repositoryId: string;
  filters: CommitFilters;
  limit: number;
  cursor?: string;
}): Promise<{
  commits: CommitSummary[];
  hasMore: boolean;
  nextCursor?: string;
}> {
  const response = await request<Response<'commitLog/result'>>(
    { type: 'commitLog/search', ...input },
    'commitLog',
  );
  return {
    commits: response.commits,
    hasMore: response.hasMore,
    nextCursor: response.nextCursor,
  };
}

export async function loadCommitDetail(input: {
  repositoryId: string;
  commitHash: string;
  parentIndex: number;
}): Promise<CommitDetail> {
  const response = await request<Response<'commitDetail/result'>>(
    { type: 'commitDetail/load', ...input },
    'commitDetail',
  );
  return response.detail;
}

export async function openDiffInEditor(input: {
  repositoryId: string;
  commitHash: string;
  parentIndex: number;
  oldPath?: string;
  newPath: string;
}): Promise<void> {
  await request<Response<'diff/openedInEditor'>>({
    type: 'diff/openInEditor',
    ...input,
  });
}

export async function cherryPick(input: {
  repositoryId: string;
  commitHash: string;
}): Promise<{ status: string; message: string }> {
  const response = await request<Response<'commit/cherryPickResult'>>({
    type: 'commit/cherryPick',
    ...input,
  });
  return { status: response.status, message: response.message };
}

export async function loadDiff(input: {
  repositoryId: string;
  commitHash: string;
  parentIndex: number;
  oldPath?: string;
  newPath: string;
  mode: 'changes' | 'full';
}): Promise<DiffModel> {
  const response = await request<Response<'diff/result'>>(
    { type: 'diff/load', ...input },
    'diff',
  );
  return response.diff;
}
