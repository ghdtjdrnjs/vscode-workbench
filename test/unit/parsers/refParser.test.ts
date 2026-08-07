import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRefs } from '../../../src/git/parsers/refParser';
import { parseNameStatusOutput } from '../../../src/git/parsers/nameStatusParser';

const FIXTURES = join(__dirname, '../../fixtures/git-output');

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

describe('parseRefs', () => {
  const refs = parseRefs(fixture('refs.bin'), 'for-each-ref');

  it('local/remote/tag를 구분한다', () => {
    expect(refs.filter(ref => ref.kind === 'local').map(ref => ref.shortName)).toEqual(
      expect.arrayContaining(['main', 'feature']),
    );
    expect(
      refs.filter(ref => ref.kind === 'remote').map(ref => ref.shortName),
    ).toEqual(expect.arrayContaining(['origin/main', 'origin/feature']));
    expect(refs.filter(ref => ref.kind === 'tag').map(ref => ref.shortName)).toEqual(
      ['v1.0.0'],
    );
  });

  it('현재 branch에 isCurrent를 세운다', () => {
    const current = refs.filter(ref => ref.isCurrent);

    expect(current).toHaveLength(1);
    expect(current[0].shortName).toBe('main');
  });

  it('origin/HEAD를 symbolic ref로 표시한다', () => {
    const head = refs.find(ref => ref.shortName === 'origin/HEAD');

    expect(head?.isSymbolic).toBe(true);
    expect(refs.filter(ref => !ref.isSymbolic).length).toBe(refs.length - 1);
  });

  it('--contains 결과에 두 branch가 모두 들어 있다', () => {
    const contains = parseRefs(fixture('refs-contains.bin'), 'contains');

    expect(contains.map(ref => ref.shortName)).toEqual(
      expect.arrayContaining(['feature', 'main', 'origin/feature', 'origin/main']),
    );
  });
});

describe('parseNameStatusOutput', () => {
  it('merge commit은 parent에 따라 변경 파일이 다르다', () => {
    const first = parseNameStatusOutput(
      fixture('name-status-merge-p1.bin'),
      'merge-p1',
    );
    const second = parseNameStatusOutput(
      fixture('name-status-merge-p2.bin'),
      'merge-p2',
    );

    expect(first).toEqual([{ status: 'M', newPath: 'src/b.ts' }]);
    expect(second).toEqual([{ status: 'A', newPath: 'README.md' }]);
  });

  it('root commit의 변경 파일을 diff-tree --root에서 읽는다', () => {
    expect(
      parseNameStatusOutput(fixture('name-status-root.bin'), 'root'),
    ).toEqual([{ status: 'A', newPath: 'src/a.ts' }]);
  });

  it('rename/copy similarity를 숫자로 읽는다', () => {
    const tokens = ['R100', 'a.txt', 'b.txt', 'C087', 'a.txt', 'c.txt'].join('\0');

    expect(parseNameStatusOutput(tokens, 'synthetic')).toEqual([
      { status: 'R', oldPath: 'a.txt', newPath: 'b.txt', similarity: 100 },
      { status: 'C', oldPath: 'a.txt', newPath: 'c.txt', similarity: 87 },
    ]);
  });

  it('경로 토큰이 모자라면 오류를 던진다', () => {
    expect(() => parseNameStatusOutput('R100\0only-old', 'short')).toThrow(
      /short/,
    );
  });
});
