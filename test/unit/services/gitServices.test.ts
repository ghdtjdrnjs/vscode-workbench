import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommitDetailService } from '../../../src/git/CommitDetailService';
import { CommitLogService } from '../../../src/git/CommitLogService';
import { DiffService } from '../../../src/git/DiffService';
import { FileHistoryService } from '../../../src/git/FileHistoryService';
import { GitProcessRunner } from '../../../src/git/GitProcessRunner';
import { GitQueryCache } from '../../../src/git/GitQueryCache';
import { RepositoryResolver } from '../../../src/git/RepositoryResolver';
// 타입은 실제 @types/vscode를 쓰고, 런타임 구현만 vitest alias가 스텁으로 바꾼다.
import type { CancellationToken } from 'vscode';
import {
  CancellationTokenSource,
  Uri,
  createOutputChannel,
} from '../../stubs/vscode';

const CREATE_SCRIPT = join(__dirname, '../../fixtures/create-repo.sh');

let repoRoot: string;
let workDir: string;

let runner: GitProcessRunner;
let resolver: RepositoryResolver;
let fileHistory: FileHistoryService;
let commitLog: CommitLogService;
let commitDetail: CommitDetailService;
let diffService: DiffService;

function newToken(): CancellationToken {
  return new CancellationTokenSource().token as unknown as CancellationToken;
}

/** RepositoryResolver가 기대하는 최소한의 내장 Git API 형태를 만든다. */
function fakeGitApi(root: string) {
  const repository = {
    rootUri: Uri.file(root),
    state: { HEAD: { name: 'main', commit: undefined }, refs: [] },
  };

  return {
    git: { path: 'git' },
    repositories: [repository],
    getRepository: () => repository,
  };
}

function createServices(root: string) {
  const output = createOutputChannel();
  const newRunner = new GitProcessRunner('git', output as never);
  const newResolver = new RepositoryResolver(fakeGitApi(root) as never);
  const newCache = new GitQueryCache(output as never);
  const newCommitDetail = new CommitDetailService(
    newRunner,
    newResolver,
    newCache,
  );

  return {
    runner: newRunner,
    resolver: newResolver,
    cache: newCache,
    commitDetail: newCommitDetail,
    fileHistory: new FileHistoryService(newRunner, newResolver, newCache),
    commitLog: new CommitLogService(newRunner, newResolver, newCache),
    diff: new DiffService(
      newRunner,
      newResolver,
      newCache,
      newCommitDetail,
      () => 2 * 1024 * 1024,
    ),
  };
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'gwb-'));
  repoRoot = join(workDir, 'repo');
  execFileSync('sh', [CREATE_SCRIPT, repoRoot], { stdio: 'pipe' });

  const services = createServices(repoRoot);
  runner = services.runner;
  resolver = services.resolver;
  fileHistory = services.fileHistory;
  commitLog = services.commitLog;
  commitDetail = services.commitDetail;
  diffService = services.diff;
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function repositoryId(): string {
  return resolver.list()[0].id;
}

describe('FileHistoryService', () => {
  it('rename 이전 이력까지 이어서 읽는다', async () => {
    const result = await fileHistory.load(
      { uri: Uri.file(join(repoRoot, 'src/b.ts')) as never, limit: 100 },
      newToken(),
    );

    expect(result.relativePath).toBe('src/b.ts');
    expect(result.entries.map(entry => entry.subject)).toEqual([
      'feat: extend b.ts on feature',
      'refactor: rename a.ts to b.ts',
      'fix: update a.ts values',
      'feat: add a.ts',
    ]);

    const renameEntry = result.entries[1];
    expect(renameEntry.status).toBe('R');
    expect(renameEntry.previousPath).toBe('src/a.ts');

    // rename 이전 커밋은 예전 경로로 이어진다.
    expect(result.entries[2].pathAtCommit).toBe('src/a.ts');
    expect(result.entries[3].pathAtCommit).toBe('src/a.ts');
  });

  it('공백과 한글이 있는 경로도 조회한다', async () => {
    const result = await fileHistory.load(
      {
        uri: Uri.file(join(repoRoot, '문서 폴더/설계 문서.md')) as never,
        limit: 100,
      },
      newToken(),
    );

    expect(result.relativePath).toBe('문서 폴더/설계 문서.md');
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].authorName).toBe('홍길동');
  });

  it('저장소 밖 파일은 명확한 오류를 낸다', async () => {
    await expect(
      fileHistory.load(
        { uri: Uri.file(join(workDir, 'outside.txt')) as never, limit: 20 },
        newToken(),
      ),
    ).rejects.toThrow(/Git 저장소에 포함되어 있지 않습니다/);
  });
});

describe('CommitLogService', () => {
  it('local/remote/tag ref를 모두 읽는다', async () => {
    const refs = await commitLog.loadRefs(repositoryId(), newToken());

    expect(refs.filter(ref => ref.kind === 'local').map(ref => ref.shortName)).toEqual(
      expect.arrayContaining(['main', 'feature']),
    );
    expect(refs.some(ref => ref.shortName === 'origin/main')).toBe(true);
    expect(refs.some(ref => ref.isCurrent && ref.shortName === 'main')).toBe(true);
  });

  it('전체 refs 기준 커밋을 topo order로 읽는다', async () => {
    const page = await commitLog.load(
      { repositoryId: repositoryId(), filters: { allRefs: true }, limit: 100 },
      newToken(),
    );

    expect(page.commits.length).toBe(13);
    expect(page.hasMore).toBe(false);
    expect(page.commits[0].subject).toBe('chore: remove README');
  });

  it('branch를 지정하면 그 branch 이력만 나온다', async () => {
    const page = await commitLog.load(
      {
        repositoryId: repositoryId(),
        filters: { allRefs: false, ref: 'feature' },
        limit: 100,
      },
      newToken(),
    );

    expect(page.commits.map(commit => commit.subject)).toEqual([
      'feat: extend b.ts on feature',
      'refactor: rename a.ts to b.ts',
      'fix: update a.ts values',
      'feat: add a.ts',
    ]);
  });

  it('메시지 검색은 문자열 그대로 비교한다', async () => {
    const page = await commitLog.load(
      {
        repositoryId: repositoryId(),
        filters: { allRefs: true, message: '한글' },
        limit: 100,
      },
      newToken(),
    );

    expect(page.commits).toHaveLength(2);
    expect(
      page.commits.every(commit => commit.subject.includes('한글')),
    ).toBe(true);
  });

  it('작성자와 날짜 범위를 조합할 수 있다', async () => {
    const page = await commitLog.load(
      {
        repositoryId: repositoryId(),
        filters: {
          allRefs: true,
          author: '홍길동',
          since: '2024-01-09',
          until: '2024-01-11',
        },
        limit: 100,
      },
      newToken(),
    );

    expect(page.commits.length).toBeGreaterThan(0);
    expect(
      page.commits.every(commit => commit.authorDate >= '2024-01-09'),
    ).toBe(true);
  });

  it('`-`로 시작하는 ref는 거부한다', async () => {
    await expect(
      commitLog.load(
        {
          repositoryId: repositoryId(),
          filters: { allRefs: false, ref: '--output=/tmp/pwned' },
          limit: 20,
        },
        newToken(),
      ),
    ).rejects.toThrow(/ref 이름/);
  });
});

describe('CommitDetailService', () => {
  async function hashOfSubject(subject: string): Promise<string> {
    const page = await commitLog.load(
      { repositoryId: repositoryId(), filters: { allRefs: true }, limit: 100 },
      newToken(),
    );
    const commit = page.commits.find(entry => entry.subject === subject);

    if (!commit) {
      throw new Error(`commit not found: ${subject}`);
    }

    return commit.hash;
  }

  it('merge commit은 parent에 따라 변경 파일이 달라진다', async () => {
    const hash = await hashOfSubject('merge: feature into main');

    const first = await commitDetail.load(
      { repositoryId: repositoryId(), commitHash: hash, parentIndex: 0 },
      newToken(),
    );
    const second = await commitDetail.load(
      { repositoryId: repositoryId(), commitHash: hash, parentIndex: 1 },
      newToken(),
    );

    expect(first.parentHashes).toHaveLength(2);
    expect(first.changedFiles.map(file => file.newPath)).toEqual(['src/b.ts']);
    expect(second.changedFiles.map(file => file.newPath)).toEqual(['README.md']);
  });

  it('root commit 상세를 오류 없이 읽는다', async () => {
    const hash = await hashOfSubject('feat: add a.ts');

    const detail = await commitDetail.load(
      { repositoryId: repositoryId(), commitHash: hash, parentIndex: 0 },
      newToken(),
    );

    expect(detail.parentHashes).toEqual([]);
    expect(detail.changedFiles).toEqual([{ status: 'A', newPath: 'src/a.ts' }]);
  });

  it('포함 branch를 local/remote로 구분해 준다', async () => {
    const hash = await hashOfSubject('feat: extend b.ts on feature');

    const detail = await commitDetail.load(
      { repositoryId: repositoryId(), commitHash: hash, parentIndex: 0 },
      newToken(),
    );

    expect(
      detail.containingBranches.filter(ref => ref.kind === 'local').map(r => r.shortName),
    ).toEqual(expect.arrayContaining(['feature', 'main']));
    expect(
      detail.containingBranches.some(ref => ref.kind === 'remote'),
    ).toBe(true);
  });

  it('rename commit은 old/new 경로를 모두 준다', async () => {
    const hash = await hashOfSubject('refactor: rename a.ts to b.ts');

    const detail = await commitDetail.load(
      { repositoryId: repositoryId(), commitHash: hash, parentIndex: 0 },
      newToken(),
    );

    expect(detail.changedFiles).toEqual([
      { status: 'R', oldPath: 'src/a.ts', newPath: 'src/b.ts', similarity: 100 },
    ]);
  });
});

describe('DiffService', () => {
  async function commitHashOf(subject: string): Promise<string> {
    const page = await commitLog.load(
      { repositoryId: repositoryId(), filters: { allRefs: true }, limit: 100 },
      newToken(),
    );
    return page.commits.find(commit => commit.subject === subject)!.hash;
  }

  it('root commit의 추가 파일은 빈 tree와 비교한다', async () => {
    const diff = await diffService.load(
      {
        repositoryId: repositoryId(),
        commitHash: await commitHashOf('feat: add a.ts'),
        parentIndex: 0,
        newPath: 'src/a.ts',
        mode: 'changes',
      },
      newToken(),
    );

    expect(diff.status).toBe('A');
    expect(diff.oldFile.exists).toBe(false);
    expect(diff.hunks[0].lines.every(line => line.type === 'add')).toBe(true);
  });

  it('삭제 파일은 old 내용만 보여 준다', async () => {
    const diff = await diffService.load(
      {
        repositoryId: repositoryId(),
        commitHash: await commitHashOf('chore: remove README'),
        parentIndex: 0,
        newPath: 'README.md',
        mode: 'changes',
      },
      newToken(),
    );

    expect(diff.status).toBe('D');
    expect(diff.newFile.exists).toBe(false);
    expect(diff.hunks[0].lines.every(line => line.type === 'delete')).toBe(true);
  });

  it('binary 파일은 hunk 없이 binary로 표시한다', async () => {
    const diff = await diffService.load(
      {
        repositoryId: repositoryId(),
        commitHash: await commitHashOf('chore: update binary asset'),
        parentIndex: 0,
        newPath: 'assets/logo.bin',
        mode: 'changes',
      },
      newToken(),
    );

    expect(diff.binary).toBe(true);
    expect(diff.hunks).toEqual([]);
    expect(diff.fullViewAvailable).toBe(false);
  });

  it('rename 파일은 old/new 경로를 모두 담는다', async () => {
    const diff = await diffService.load(
      {
        repositoryId: repositoryId(),
        commitHash: await commitHashOf('refactor: rename a.ts to b.ts'),
        parentIndex: 0,
        oldPath: 'src/a.ts',
        newPath: 'src/b.ts',
        mode: 'changes',
      },
      newToken(),
    );

    expect(diff.status).toBe('R');
    expect(diff.oldFile.path).toBe('src/a.ts');
    expect(diff.newFile.path).toBe('src/b.ts');
  });

  it('full 모드에서 old/new 전체 텍스트를 함께 준다', async () => {
    const diff = await diffService.load(
      {
        repositoryId: repositoryId(),
        commitHash: await commitHashOf('docs: 한글 문서 수정'),
        parentIndex: 0,
        newPath: '문서 폴더/설계 문서.md',
        mode: 'full',
      },
      newToken(),
    );

    expect(diff.fullViewAvailable).toBe(true);
    expect(diff.oldFile.text).toContain('둘째 줄');
    expect(diff.newFile.text).toContain('셋째 줄');
  });

  it('merge commit은 선택한 parent 기준으로 diff를 만든다', async () => {
    const hash = await commitHashOf('merge: feature into main');

    const againstSecond = await diffService.load(
      {
        repositoryId: repositoryId(),
        commitHash: hash,
        parentIndex: 1,
        newPath: 'README.md',
        mode: 'changes',
      },
      newToken(),
    );

    expect(againstSecond.status).toBe('A');
  });

  it('상위 경로를 벗어나는 path는 거부한다', async () => {
    await expect(
      diffService.load(
        {
          repositoryId: repositoryId(),
          commitHash: await commitHashOf('feat: add a.ts'),
          parentIndex: 0,
          newPath: '../../etc/passwd',
          mode: 'changes',
        },
        newToken(),
      ),
    ).rejects.toThrow(/상위 디렉터리/);
  });
});

describe('GitProcessRunner cancellation', () => {
  it('취소된 토큰은 CancellationError로 끝난다', async () => {
    const source = new CancellationTokenSource();
    const promise = runner.run(repoRoot, ['log', '--format=%H'], source.token as never);
    source.cancel();

    await expect(promise).rejects.toThrow(/Canceled/);
  });

  it('실패한 git 명령은 표준 오류로 바뀐다', async () => {
    await expect(
      runner.run(repoRoot, ['show', 'deadbeefdeadbeefdeadbeef'], newToken() as never),
    ).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
  });
});

/**
 * pagination은 최소 limit(20)보다 많은 커밋이 있어야 실제로 --skip 경로를 탄다.
 * rename을 1페이지 마지막 항목에 두어 페이지 경계에서 경로 추적도 확인한다.
 */
describe('pagination', () => {
  let pagingDir: string;
  let pagingRoot: string;
  let services: ReturnType<typeof createServices>;

  const POST_RENAME_COMMITS = 19;
  const PRE_RENAME_COMMITS = 15;

  beforeAll(() => {
    pagingDir = mkdtempSync(join(tmpdir(), 'gwb-page-'));
    pagingRoot = join(pagingDir, 'repo');

    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: pagingRoot, stdio: 'pipe' });
    };

    execFileSync('git', ['init', '-q', '-b', 'main', pagingRoot], {
      stdio: 'pipe',
    });
    git('config', 'user.name', 'tester');
    git('config', 'user.email', 'tester@example.com');

    writeFileSync(join(pagingRoot, 'a.txt'), 'v0\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'add a.txt');

    for (let index = 1; index <= PRE_RENAME_COMMITS; index += 1) {
      writeFileSync(join(pagingRoot, 'a.txt'), `v${index}\n`);
      git('add', 'a.txt');
      git('commit', '-q', '-m', `edit a.txt #${index}`);
    }

    git('mv', 'a.txt', 'b.txt');
    git('commit', '-q', '-m', 'rename a.txt to b.txt');

    for (let index = 1; index <= POST_RENAME_COMMITS; index += 1) {
      writeFileSync(join(pagingRoot, 'b.txt'), `w${index}\n`);
      git('add', 'b.txt');
      git('commit', '-q', '-m', `edit b.txt #${index}`);
    }

    services = createServices(pagingRoot);
  });

  afterAll(() => {
    rmSync(pagingDir, { recursive: true, force: true });
  });

  function pagingRepositoryId(): string {
    return services.resolver.list()[0].id;
  }

  it('commit log 2페이지를 cursor로 이어 읽고 중복이 없다', async () => {
    const total = PRE_RENAME_COMMITS + POST_RENAME_COMMITS + 2;

    const first = await services.commitLog.load(
      { repositoryId: pagingRepositoryId(), filters: { allRefs: true }, limit: 20 },
      newToken(),
    );

    expect(first.commits).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBe('20');

    const second = await services.commitLog.load(
      {
        repositoryId: pagingRepositoryId(),
        filters: { allRefs: true },
        limit: 20,
        cursor: first.nextCursor,
      },
      newToken(),
    );

    expect(second.commits).toHaveLength(total - 20);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeUndefined();

    const firstHashes = new Set(first.commits.map(commit => commit.hash));
    const overlap = second.commits.filter(commit => firstHashes.has(commit.hash));
    expect(overlap).toEqual([]);
  });

  it('file history 2페이지를 cursor로 이어 읽는다', async () => {
    const uri = Uri.file(join(pagingRoot, 'b.txt')) as never;

    const first = await services.fileHistory.load(
      { uri, limit: 20 },
      newToken(),
    );

    expect(first.entries).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    // cursor는 다음 페이지 첫 커밋의 hash와 그 시점 경로다.
    expect(first.nextCursor).toMatch(/^[0-9a-f]{40}:a\.txt$/);

    const second = await services.fileHistory.load(
      { uri, limit: 20, cursor: first.nextCursor },
      newToken(),
    );

    const firstHashes = new Set(first.entries.map(entry => entry.hash));
    expect(
      second.entries.filter(entry => firstHashes.has(entry.hash)),
    ).toEqual([]);
  });

  it('페이지 경계에 rename이 걸려도 이전 경로를 이어서 표시한다', async () => {
    const uri = Uri.file(join(pagingRoot, 'b.txt')) as never;

    const first = await services.fileHistory.load(
      { uri, limit: 20 },
      newToken(),
    );

    // 1페이지 마지막 항목이 rename commit이다.
    const lastOfFirstPage = first.entries[first.entries.length - 1];
    expect(lastOfFirstPage.subject).toBe('rename a.txt to b.txt');
    expect(lastOfFirstPage.status).toBe('R');
    expect(lastOfFirstPage.previousPath).toBe('a.txt');

    const second = await services.fileHistory.load(
      { uri, limit: 20, cursor: first.nextCursor },
      newToken(),
    );

    // 2페이지는 전부 rename 이전 커밋이므로 예전 경로여야 한다.
    expect(second.entries.length).toBeGreaterThan(0);
    expect(second.entries.every(entry => entry.pathAtCommit === 'a.txt')).toBe(
      true,
    );
  });
});
