/**
 * VS Code 내장 Git extension(`vscode.git`)이 노출하는 API의 부분 정의.
 * Git Workbench가 실제로 사용하는 멤버만 옮겨 둔다.
 * 원본: https://github.com/microsoft/vscode/blob/main/extensions/git/src/api/git.d.ts
 */

import type { Disposable, Event, Uri } from 'vscode';

export interface Ref {
  readonly type: RefType;
  readonly name?: string;
  readonly commit?: string;
  readonly remote?: string;
}

export declare enum RefType {
  Head = 0,
  RemoteHead = 1,
  Tag = 2,
}

export interface Branch extends Ref {
  readonly upstream?: { readonly name: string; readonly remote: string };
  readonly ahead?: number;
  readonly behind?: number;
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly refs: Ref[];
  readonly onDidChange: Event<void>;
}

export interface Repository {
  readonly rootUri: Uri;
  readonly state: RepositoryState;
  buffer(ref: string, path: string): Promise<Buffer>;
  getCommit(ref: string): Promise<Commit>;
}

export interface Commit {
  readonly hash: string;
  readonly message: string;
  readonly parents: string[];
  readonly authorDate?: Date;
  readonly authorName?: string;
  readonly authorEmail?: string;
  readonly commitDate?: Date;
}

export interface API {
  readonly git: { readonly path: string };
  readonly repositories: Repository[];
  readonly onDidOpenRepository: Event<Repository>;
  readonly onDidCloseRepository: Event<Repository>;
  getRepository(uri: Uri): Repository | null;
}

export interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: Event<boolean>;
  getAPI(version: 1): API;
}

export type { Disposable };
