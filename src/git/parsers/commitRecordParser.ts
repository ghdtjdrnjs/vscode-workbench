import { COMMIT_RECORD_MARKER, FIELD_SEPARATOR } from '../../shared/constants';
import { GitWorkbenchError } from '../../shared/errors';
import type { ChangedFile, CommitSummary } from '../../shared/models';
import { parseNameStatusTokens } from './nameStatusParser';

/**
 * git log/show에 넘기는 --format 문자열.
 *
 * 레코드는 NUL로 시작하고 필드는 US(0x1f)로 구분한다.
 * `-z --name-status`를 함께 쓰면 헤더 뒤에 name-status 레코드가 NUL로 이어 붙는데,
 * NUL만으로는 헤더와 구분할 수 없기 때문에 필드 구분자를 US로 분리해 둔다.
 */
export const COMMIT_FORMAT =
  `%x00${COMMIT_RECORD_MARKER}` +
  '%x1f%H' + // full hash
  '%x1f%P' + // parent hashes (space separated)
  '%x1f%an' + // author name
  '%x1f%ae' + // author email
  '%x1f%aI' + // author date (ISO 8601 strict)
  '%x1f%cI' + // committer date
  '%x1f%D' + // decorations
  '%x1f%s' + // subject
  '%x1f%b' + // body
  '%x1f';

export interface CommitRecord {
  commit: CommitSummary;
  changedFiles: ChangedFile[];
}

/**
 * `git log --format=COMMIT_FORMAT [-z --name-status]` 출력을 파싱한다.
 *
 * 실제 출력 형태(확인 완료):
 *   \0__GWB_COMMIT__\x1f<fields...>\x1f\0 \n M \0 path \0 \0__GWB_COMMIT__ ...
 * name-status가 없으면 각 레코드가 개행으로 끝난다.
 */
export function parseCommitRecords(
  stdout: Buffer | string,
  commandLabel: string,
): CommitRecord[] {
  const text =
    typeof stdout === 'string' ? stdout : stdout.toString('utf8');
  const tokens = text.split('\0');
  const records: CommitRecord[] = [];

  let current: CommitRecord | undefined;
  let pendingStatusTokens: string[] = [];

  const flush = (): void => {
    if (!current) {
      return;
    }

    current.changedFiles = parseNameStatusTokens(
      pendingStatusTokens,
      commandLabel,
    );
    records.push(current);
    pendingStatusTokens = [];
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const raw = tokens[index];

    if (raw === '') {
      continue;
    }

    // 헤더 직후의 첫 name-status 토큰에는 개행이 하나 붙는다.
    const token = raw.startsWith('\n') ? raw.slice(1) : raw;

    if (token.startsWith(COMMIT_RECORD_MARKER)) {
      flush();
      current = {
        commit: parseHeader(token, commandLabel, index),
        changedFiles: [],
      };
      continue;
    }

    if (!current) {
      throw new GitWorkbenchError(
        'PARSER_FAILED',
        `${commandLabel}: commit 헤더보다 먼저 나온 레코드 (token #${index})`,
      );
    }

    pendingStatusTokens.push(token);
  }

  flush();

  return records;
}

function parseHeader(
  token: string,
  commandLabel: string,
  tokenIndex: number,
): CommitSummary {
  const fields = token.split(FIELD_SEPARATOR);

  if (fields.length < 11) {
    throw new GitWorkbenchError(
      'PARSER_FAILED',
      `${commandLabel}: commit 헤더 필드가 부족하다 (${fields.length}개, token #${tokenIndex})`,
    );
  }

  const hash = fields[1];

  if (!/^[0-9a-f]{7,64}$/.test(hash)) {
    throw new GitWorkbenchError(
      'PARSER_FAILED',
      `${commandLabel}: commit hash 형식이 아니다 "${hash}" (token #${tokenIndex})`,
    );
  }

  // 마지막 필드는 format 끝의 sentinel이다. subject 이후 남은 필드를 모두 body로 복원해
  // 본문에 US 문자가 들어 있어도 잘리지 않게 한다.
  const body = fields.slice(9, fields.length - 1).join(FIELD_SEPARATOR);

  return {
    hash,
    shortHash: hash.slice(0, 7),
    parentHashes: fields[2] ? fields[2].split(' ').filter(Boolean) : [],
    authorName: fields[3],
    authorEmail: fields[4] || undefined,
    authorDate: fields[5],
    committerDate: fields[6] || undefined,
    decorations: parseDecorations(fields[7]),
    subject: fields[8],
    body: body.trim() ? body.replace(/\n+$/, '') : undefined,
  };
}

/** `HEAD -> main, tag: v1.0.0, origin/main` 형태를 ref 이름 배열로 만든다. */
export function parseDecorations(value: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(', ')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => entry.replace(/^HEAD -> /, '').replace(/^tag: /, ''))
    .map(entry => entry.replace(/^refs\/(heads|remotes|tags)\//, ''));
}
