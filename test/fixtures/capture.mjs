// 계획서 26.1의 parser fixture를 실제 git 출력으로 만든다.
// 사용법: node test/fixtures/capture.mjs <fixture-repo-dir>
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.argv[2];

if (!repo) {
  console.error('usage: node capture.mjs <fixture-repo-dir>');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'git-output');
mkdirSync(outDir, { recursive: true });

const COMMIT_FORMAT =
  '%x00__GWB_COMMIT__%x1f%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%cI%x1f%D%x1f%s%x1f%b%x1f';
const REF_FORMAT =
  '%(refname)%00%(refname:short)%00%(objectname)%00%(HEAD)%00%(upstream:short)%00%(symref)%00';

function git(args) {
  return execFileSync('git', ['--no-pager', '-c', 'core.quotepath=false', ...args], {
    cwd: repo,
    maxBuffer: 1 << 28,
  });
}

function save(name, buffer) {
  writeFileSync(join(outDir, name), buffer);
  console.log(`saved ${name} (${buffer.length} bytes)`);
}

const rev = ref => git(['rev-parse', ref]).toString('utf8').trim();

const rootCommit = git(['rev-list', '--max-parents=0', 'main'])
  .toString('utf8')
  .trim()
  .split('\n')[0];
const mergeCommit = rev('main~7');

save(
  'file-history-follow.bin',
  git([
    'log',
    '--follow',
    '--date=iso-strict',
    '--name-status',
    '-M',
    '-z',
    `--format=${COMMIT_FORMAT}`,
    '--',
    'src/b.ts',
  ]),
);

save(
  'file-history-korean.bin',
  git([
    'log',
    '--follow',
    '--date=iso-strict',
    '--name-status',
    '-M',
    '-z',
    `--format=${COMMIT_FORMAT}`,
    '--',
    '문서 폴더/설계 문서.md',
  ]),
);

save(
  'commit-log-all.bin',
  git([
    'log',
    '--all',
    '--topo-order',
    '--date=iso-strict',
    `--format=${COMMIT_FORMAT}`,
  ]),
);

save(
  'commit-show-merge.bin',
  git(['show', '--no-patch', '--date=iso-strict', `--format=${COMMIT_FORMAT}`, mergeCommit]),
);

save('refs.bin', git(['for-each-ref', '--sort=-committerdate', `--format=${REF_FORMAT}`, 'refs/heads', 'refs/remotes', 'refs/tags']));

save(
  'refs-contains.bin',
  git(['for-each-ref', '--contains=feature', `--format=${REF_FORMAT}`, 'refs/heads', 'refs/remotes']),
);

save(
  'name-status-merge-p1.bin',
  git(['diff', '--name-status', '-M', '-C', '-z', `${mergeCommit}^1`, mergeCommit]),
);

save(
  'name-status-merge-p2.bin',
  git(['diff', '--name-status', '-M', '-C', '-z', `${mergeCommit}^2`, mergeCommit]),
);

save(
  'name-status-root.bin',
  git(['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-M', '-C', '-z', rootCommit]),
);

const patch = (from, to, ...paths) =>
  git([
    'diff',
    '--unified=3',
    '--no-ext-diff',
    '--no-textconv',
    '-M',
    from,
    to,
    '--',
    ...paths,
  ]);

save('patch-modify.bin', patch('main~11', 'main~10', 'src/a.ts'));
save('patch-rename.bin', patch('main~10', 'main~9', 'src/a.ts', 'src/b.ts'));
save('patch-korean.bin', patch('main~4', 'main~3', '문서 폴더/설계 문서.md'));
save('patch-binary.bin', patch('main~6', 'main~5', 'assets/logo.bin'));
save('patch-delete.bin', patch('main~1', 'main', 'README.md'));
save(
  'patch-root-add.bin',
  patch('4b825dc642cb6eb9a060e54bf8d69288fbee4904', rootCommit, 'src/a.ts'),
);
save('patch-no-newline.bin', patch('main~2', 'main~1', 'src/tail.txt'));

console.log('done');
