import { GitWorkbenchError } from '../../shared/errors';
import type { BranchRef, RefKind } from '../../shared/models';

/** git for-each-ref에 넘기는 --format. 필드는 NUL, 레코드는 개행으로 구분된다. */
export const REF_FORMAT =
  '%(refname)%00' +
  '%(refname:short)%00' +
  '%(objectname)%00' +
  '%(HEAD)%00' +
  '%(upstream:short)%00' +
  '%(symref)%00';

export function parseRefs(
  stdout: Buffer | string,
  commandLabel: string,
): BranchRef[] {
  const text = typeof stdout === 'string' ? stdout : stdout.toString('utf8');
  const refs: BranchRef[] = [];

  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.trim() === '') {
      continue;
    }

    const fields = line.split('\0');

    if (fields.length < 6) {
      throw new GitWorkbenchError(
        'PARSER_FAILED',
        `${commandLabel}: ref 레코드 필드가 부족하다 (${fields.length}개, line ${index + 1})`,
      );
    }

    const fullName = fields[0];
    const kind = refKindOf(fullName);

    if (!kind) {
      continue;
    }

    refs.push({
      fullName,
      shortName: fields[1],
      kind,
      commitHash: fields[2],
      isCurrent: fields[3] === '*',
      upstream: fields[4] || undefined,
      isSymbolic: fields[5] !== '',
    });
  }

  return refs;
}

function refKindOf(fullName: string): RefKind | undefined {
  if (fullName.startsWith('refs/heads/')) {
    return 'local';
  }

  if (fullName.startsWith('refs/remotes/')) {
    return 'remote';
  }

  if (fullName.startsWith('refs/tags/')) {
    return 'tag';
  }

  return undefined;
}
