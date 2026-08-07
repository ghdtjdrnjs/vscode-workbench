#!/bin/sh
# 계획서 26.2의 이력을 가진 테스트 repository를 만든다.
# 사용법: sh create-repo.sh <target-dir>
set -eu

TARGET="$1"
rm -rf "$TARGET"
mkdir -p "$TARGET"
cd "$TARGET"

export GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME="홍길동"
export GIT_AUTHOR_EMAIL="hong@example.com"
export GIT_COMMITTER_NAME="홍길동"
export GIT_COMMITTER_EMAIL="hong@example.com"
export GIT_AUTHOR_DATE="2024-01-01T09:00:00+09:00"
export GIT_COMMITTER_DATE="2024-01-01T09:00:00+09:00"

git init -q -b main .
git config user.name "홍길동"
git config user.email "hong@example.com"
git config commit.gpgsign false

bump_date() {
  GIT_AUTHOR_DATE="2024-01-$1T09:00:00+09:00"
  GIT_COMMITTER_DATE="2024-01-$1T09:00:00+09:00"
  export GIT_AUTHOR_DATE GIT_COMMITTER_DATE
}

# 2. src/a.ts 추가 (root commit)
mkdir -p src
printf 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n' > src/a.ts
git add src/a.ts
bump_date 01
git commit -q -m "feat: add a.ts

첫 번째 커밋 본문이다.
여러 줄로 구성되어 있다."

# 3. src/a.ts 수정
printf 'export const a = 10;\nexport const b = 2;\nexport const c = 3;\nexport const d = 4;\n' > src/a.ts
git add src/a.ts
bump_date 02
git commit -q -m "fix: update a.ts values"

# 4. src/a.ts -> src/b.ts rename
git mv src/a.ts src/b.ts
bump_date 03
git commit -q -m "refactor: rename a.ts to b.ts"

# 5-6. feature branch에서 수정
git checkout -q -b feature
printf 'export const a = 10;\nexport const b = 20;\nexport const c = 3;\nexport const d = 4;\nexport const e = 5;\n' > src/b.ts
git add src/b.ts
bump_date 04
git commit -q -m "feat: extend b.ts on feature"

# 7. main에서 다른 파일 수정
git checkout -q main
printf '# Git Workbench fixture\n' > README.md
git add README.md
bump_date 05
git commit -q -m "docs: add README"

# 8. merge commit
bump_date 06
git merge -q --no-ff -m "merge: feature into main" feature

# 9. binary 파일 추가 및 수정
mkdir -p assets
printf '\000\001\002\003BINARY\000' > assets/logo.bin
git add assets/logo.bin
bump_date 07
git commit -q -m "chore: add binary asset"

printf '\000\001\002\003BINARY-V2\000\004' > assets/logo.bin
git add assets/logo.bin
bump_date 08
git commit -q -m "chore: update binary asset"

# 10. 한글과 공백이 포함된 파일
mkdir -p "문서 폴더"
printf '첫 줄\n둘째 줄\n' > "문서 폴더/설계 문서.md"
git add "문서 폴더/설계 문서.md"
bump_date 09
git commit -q -m "docs: 한글 경로 문서 추가"

printf '첫 줄\n둘째 줄 수정\n셋째 줄\n' > "문서 폴더/설계 문서.md"
git add "문서 폴더/설계 문서.md"
bump_date 10
git commit -q -m "docs: 한글 문서 수정"

# copy 감지용 파일
cp src/b.ts src/c.ts
git add src/c.ts
bump_date 11
git commit -q -m "feat: copy b.ts to c.ts"

# no newline at end of file
printf 'no trailing newline' > src/tail.txt
git add src/tail.txt
bump_date 12
git commit -q -m "chore: add file without trailing newline"

# 11. 파일 삭제
git rm -q README.md
bump_date 13
git commit -q -m "chore: remove README"

# 12. remote ref 모사
git update-ref refs/remotes/origin/main "$(git rev-parse main)"
git update-ref refs/remotes/origin/feature "$(git rev-parse feature)"
git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main
git tag v1.0.0 main

echo "created: $TARGET"
