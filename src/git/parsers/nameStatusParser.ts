import { GitWorkbenchError } from '../../shared/errors';
import type { ChangeStatus, ChangedFile } from '../../shared/models';

const STATUS_PATTERN = /^([AMDRCTUX])(\d{1,3})?$/;

/**
 * `--name-status -z` 토큰 배열을 ChangedFile로 변환한다.
 *
 * 토큰 배치:
 *   M  <path>
 *   A  <path>
 *   D  <path>
 *   R100 <oldPath> <newPath>
 *   C087 <oldPath> <newPath>
 */
export function parseNameStatusTokens(
  tokens: readonly string[],
  commandLabel: string,
): ChangedFile[] {
  const files: ChangedFile[] = [];

  let index = 0;

  while (index < tokens.length) {
    const statusToken = tokens[index];

    if (statusToken === '') {
      index += 1;
      continue;
    }

    const match = STATUS_PATTERN.exec(statusToken);

    if (!match) {
      throw new GitWorkbenchError(
        'PARSER_FAILED',
        `${commandLabel}: name-status 토큰을 해석할 수 없다 "${statusToken}" (index ${index})`,
      );
    }

    const status = match[1] as ChangeStatus;
    const similarity = match[2] ? Number(match[2]) : undefined;
    const isRenameOrCopy = status === 'R' || status === 'C';
    const expected = isRenameOrCopy ? 2 : 1;

    if (tokens.length - index - 1 < expected) {
      throw new GitWorkbenchError(
        'PARSER_FAILED',
        `${commandLabel}: "${statusToken}" 뒤에 경로 토큰이 ${expected}개 필요하다`,
      );
    }

    if (isRenameOrCopy) {
      files.push({
        status,
        oldPath: tokens[index + 1],
        newPath: tokens[index + 2],
        similarity,
      });
      index += 3;
      continue;
    }

    files.push({
      status,
      newPath: tokens[index + 1],
      ...(status === 'D' ? { oldPath: tokens[index + 1] } : {}),
    });
    index += 2;
  }

  return files;
}

/** `git diff --name-status -z` 단독 출력(헤더 없음)을 파싱한다. */
export function parseNameStatusOutput(
  stdout: Buffer | string,
  commandLabel: string,
): ChangedFile[] {
  const text = typeof stdout === 'string' ? stdout : stdout.toString('utf8');
  const tokens = text.split('\0').filter(token => token !== '');
  return parseNameStatusTokens(tokens, commandLabel);
}
