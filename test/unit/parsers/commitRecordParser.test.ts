import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseCommitRecords,
  parseDecorations,
} from '../../../src/git/parsers/commitRecordParser';

const FIXTURES = join(__dirname, '../../fixtures/git-output');

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

describe('parseCommitRecords', () => {
  it('--follow 이력을 최신순으로 파싱한다', () => {
    const records = parseCommitRecords(
      fixture('file-history-follow.bin'),
      'file-history',
    );

    expect(records).toHaveLength(4);
    expect(records[0].commit.subject).toBe('feat: extend b.ts on feature');
    expect(records[3].commit.subject).toBe('feat: add a.ts');

    // 최신 → 과거 순서
    const dates = records.map(record => record.commit.authorDate);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('한글 author와 여러 줄 body를 보존한다', () => {
    const records = parseCommitRecords(
      fixture('file-history-follow.bin'),
      'file-history',
    );
    const root = records[3];

    expect(root.commit.authorName).toBe('홍길동');
    expect(root.commit.authorEmail).toBe('hong@example.com');
    expect(root.commit.body).toContain('첫 번째 커밋 본문이다.');
    expect(root.commit.body).toContain('여러 줄로 구성되어 있다.');
  });

  it('root commit의 parent는 비어 있다', () => {
    const records = parseCommitRecords(
      fixture('file-history-follow.bin'),
      'file-history',
    );

    expect(records[3].commit.parentHashes).toEqual([]);
    expect(records[3].changedFiles).toEqual([
      { status: 'A', newPath: 'src/a.ts' },
    ]);
  });

  it('rename 레코드에서 old/new 경로를 모두 얻는다', () => {
    const records = parseCommitRecords(
      fixture('file-history-follow.bin'),
      'file-history',
    );
    const renameRecord = records.find(
      record => record.commit.subject === 'refactor: rename a.ts to b.ts',
    );

    expect(renameRecord?.changedFiles).toEqual([
      {
        status: 'R',
        oldPath: 'src/a.ts',
        newPath: 'src/b.ts',
        similarity: 100,
      },
    ]);
  });

  it('공백과 한글이 섞인 경로를 그대로 읽는다', () => {
    const records = parseCommitRecords(
      fixture('file-history-korean.bin'),
      'file-history',
    );

    expect(records).toHaveLength(2);
    expect(records[0].changedFiles[0].newPath).toBe('문서 폴더/설계 문서.md');
    expect(records[1].changedFiles[0]).toEqual({
      status: 'A',
      newPath: '문서 폴더/설계 문서.md',
    });
  });

  it('name-status 없이 나온 commit log도 파싱한다', () => {
    const records = parseCommitRecords(
      fixture('commit-log-all.bin'),
      'commit-log',
    );

    expect(records.length).toBeGreaterThanOrEqual(13);
    expect(records.every(record => record.changedFiles.length === 0)).toBe(true);
    expect(records.every(record => /^[0-9a-f]{40}$/.test(record.commit.hash))).toBe(
      true,
    );
  });

  it('merge commit의 parent를 두 개로 읽는다', () => {
    const records = parseCommitRecords(
      fixture('commit-show-merge.bin'),
      'commit-show',
    );

    expect(records).toHaveLength(1);
    expect(records[0].commit.parentHashes).toHaveLength(2);
    expect(records[0].commit.subject).toBe('merge: feature into main');
  });

  it('잘못된 입력은 조용히 넘기지 않고 오류를 던진다', () => {
    expect(() =>
      parseCommitRecords('\0__GWB_COMMIT__not-a-hash', 'broken'),
    ).toThrow(/broken/);
  });
});

describe('parseDecorations', () => {
  it('HEAD 화살표와 refs/ 접두어를 정리한다', () => {
    expect(
      parseDecorations(
        'HEAD -> refs/heads/main, tag: refs/tags/v1.0.0, refs/remotes/origin/main',
      ),
    ).toEqual(['main', 'v1.0.0', 'origin/main']);
  });

  it('빈 문자열은 빈 배열이다', () => {
    expect(parseDecorations('')).toEqual([]);
  });
});
