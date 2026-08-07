import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hunkLineCounts,
  parsePatch,
} from '../../../src/git/parsers/patchParser';

const FIXTURES = join(__dirname, '../../fixtures/git-output');

function patch(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

describe('parsePatch', () => {
  it('수정 patch의 line number를 정확히 계산한다', () => {
    const result = parsePatch(patch('patch-modify.bin'), 'patch-modify');

    expect(result.binary).toBe(false);
    expect(result.hunks).toHaveLength(1);

    const hunk = result.hunks[0];
    expect(hunk.oldStart).toBe(1);
    expect(hunk.newStart).toBe(1);

    const counts = hunkLineCounts(hunk);
    expect(counts.old).toBe(hunk.oldLines);
    expect(counts.new).toBe(hunk.newLines);

    const deleted = hunk.lines.filter(line => line.type === 'delete');
    const added = hunk.lines.filter(line => line.type === 'add');
    expect(deleted[0]).toMatchObject({
      content: 'export const a = 1;',
      oldLineNumber: 1,
    });
    expect(added[0]).toMatchObject({
      content: 'export const a = 10;',
      newLineNumber: 1,
    });
  });

  it('새 파일 patch를 new file로 인식한다', () => {
    const result = parsePatch(patch('patch-root-add.bin'), 'patch-root-add');

    expect(result.isNewFile).toBe(true);
    expect(result.isDeletedFile).toBe(false);
    expect(result.hunks[0].oldStart).toBe(0);
    expect(result.hunks[0].oldLines).toBe(0);
    expect(result.hunks[0].lines.every(line => line.type === 'add')).toBe(true);
  });

  it('삭제 patch를 deleted file로 인식한다', () => {
    const result = parsePatch(patch('patch-delete.bin'), 'patch-delete');

    expect(result.isDeletedFile).toBe(true);
    expect(result.hunks[0].lines.every(line => line.type === 'delete')).toBe(
      true,
    );
  });

  it('binary patch는 hunk 없이 binary 플래그만 세운다', () => {
    const result = parsePatch(patch('patch-binary.bin'), 'patch-binary');

    expect(result.binary).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  it('내용이 같은 rename은 hunk가 없다', () => {
    const result = parsePatch(patch('patch-rename.bin'), 'patch-rename');

    expect(result.binary).toBe(false);
    expect(result.hunks).toEqual([]);
  });

  it('한글과 공백이 섞인 경로의 patch를 파싱한다', () => {
    const result = parsePatch(patch('patch-korean.bin'), 'patch-korean');

    expect(result.hunks).toHaveLength(1);
    const contents = result.hunks[0].lines.map(line => line.content);
    expect(contents).toContain('첫 줄');
    expect(contents).toContain('둘째 줄 수정');
    expect(contents).toContain('셋째 줄');
  });

  it('No newline at end of file 마커를 직전 줄에 붙인다', () => {
    const result = parsePatch(
      patch('patch-no-newline.bin'),
      'patch-no-newline',
    );

    const lines = result.hunks[0].lines;
    const last = lines[lines.length - 1];
    expect(last.content).toBe('no trailing newline');
    expect(last.noNewlineAtEof).toBe(true);
  });

  it('빈 patch는 빈 결과를 돌려준다', () => {
    const result = parsePatch('', 'empty');

    expect(result.hunks).toEqual([]);
    expect(result.binary).toBe(false);
  });

  it('알 수 없는 hunk 줄 접두어는 오류를 던진다', () => {
    const broken = ['@@ -1,1 +1,1 @@', '?bad line'].join('\n');

    expect(() => parsePatch(broken, 'broken')).toThrow(/broken/);
  });
});
