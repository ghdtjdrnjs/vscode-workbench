# Git Workbench

IntelliJ IDEA의 **File History** / **Git Log** 경험을 VS Code 하단 Panel에서 제공하는 조회 전용 확장이다.

## 기능

### File History

에디터나 Explorer에서 파일을 우클릭 → **Git Workbench → Show File History**.

- 왼쪽: 해당 파일의 커밋 이력 (작성자 / 날짜 / 커밋 메시지 / 짧은 hash)
- 오른쪽: 선택한 커밋의 파일 diff
- rename 이전 이력까지 `--follow`로 추적하고, 각 항목에 그 시점의 경로를 보관한다
- `변경 구간` / `전체 파일` 전환
- `통합` / `나란히` 전환
- 전체 파일 보기에서 변경되지 않은 구간은 접히고, 위·아래·전체 단위로 펼칠 수 있다
- 추가 / 수정 / 삭제 / rename / binary / root commit 처리
- merge commit은 비교할 parent를 고를 수 있다

### Git Log

Panel의 **Git Log** 탭.

- 왼쪽: local / remote / tag 브랜치 목록, 현재 브랜치 표시, `origin/HEAD` 같은 symbolic ref는 숨김
- 가운데: 커밋 목록 + 최소 commit graph, 브랜치·작성자·날짜 범위·메시지 검색, 무한 스크롤 pagination
- 오른쪽: 커밋 상세 (메시지 본문, 작성자, 날짜, full hash, 포함 브랜치, 변경 파일)
- 변경 파일을 더블클릭하거나 Enter를 누르면 해당 파일 diff로 전환되고, `← 커밋 상세로`로 돌아온다

## 설치

```bash
npm install
npm run build
```

VS Code에서 이 폴더를 열고 `F5`를 누르면 Extension Development Host가 뜬다.

VSIX로 만들려면:

```bash
npm run package
```

## 스크립트

| 스크립트 | 설명 |
|---|---|
| `npm run build` | extension / webview / extension test 번들 생성 |
| `npm run watch` | 번들 watch |
| `npm run check-types` | `tsc --noEmit` |
| `npm run lint` | eslint |
| `npm run test:unit` | vitest (parser · 서비스 · diff segment · graph) |
| `npm run test:extension` | VS Code Extension Host 통합 테스트 (VS Code를 내려받는다) |
| `npm run package` | 타입 검사 → 단위 테스트 → production 번들 → VSIX |

## 설정

| 키 | 기본값 | 설명 |
|---|---|---|
| `gitWorkbench.commitPageSize` | 200 | 한 번에 읽는 커밋 수 |
| `gitWorkbench.fileHistoryPageSize` | 100 | 한 번에 읽는 파일 이력 수 |
| `gitWorkbench.maxTextFileBytes` | 2097152 | 전체 파일 보기 크기 상한 |
| `gitWorkbench.showCommitGraph` | true | commit graph lane 표시 |

## 구조

```text
src/                     Extension Host
├─ extension.ts          활성화, 서비스 조립
├─ api/git.d.ts          내장 Git extension API 부분 정의
├─ commands/             editor/explorer command
├─ git/                  Git 실행과 조회
│  ├─ GitProcessRunner   spawn(shell:false), 취소, 크기 제한
│  ├─ RepositoryResolver URI → repository, 상대 경로
│  ├─ *Service           FileHistory / CommitLog / CommitDetail / Diff
│  ├─ GitQueryCache      repository 단위 LRU
│  ├─ validation.ts      hash / path / ref 검증
│  └─ parsers/           NUL 구분 출력 파서
├─ panel/                WebviewView, MessageRouter, CSP HTML
└─ shared/               models, protocol, errors, diffSegments (webview와 공용)

webview/                 React UI
├─ vscode.ts             요청/응답 브리지, 그룹 단위 취소
├─ api.ts                타입 있는 요청 헬퍼
├─ components/           SplitPane, VirtualList, 상태 표시
└─ features/             fileHistory / commitLog / diff
```

### 설계 원칙

- UI 코드는 Git 명령을 모른다. Git 서비스는 React 상태를 모른다.
- 모든 Webview 통신은 `requestId`가 있는 request/response 쌍이다.
- Git은 `shell: false` + 인자 배열로만 실행한다. 사용자 입력을 shell 문자열에 합치지 않는다.
- 같은 그룹(`fileHistory` / `commitLog` / `commitDetail` / `diff` / `refs`)에 새 요청이 오면 이전 프로세스를 취소한다.
- `commit hash`, 저장소 상대 경로, ref 이름은 Extension Host에서 형식을 검증한다. `-`로 시작하는 ref는 거부한다.
- File History pagination은 `--skip`을 쓰지 않는다. `--follow`와 `--skip`을 함께 주면 git이 rename을 따라가기 전의 경로 기준으로 skip을 적용해서, skip 값이 현재 경로의 커밋 수를 넘는 순간 결과가 통째로 비어 버린다. 대신 다음 페이지 첫 커밋의 `<hash>:<path>`를 cursor로 쓴다.
- Extension Host는 webview가 첫 메시지를 보내기 전까지 route 알림을 큐에 담아 둔다. `view.show()`는 view 생성까지만 기다리고 `webview.js` 실행까지 기다리지 않기 때문이다.
- patch 헤더에서 경로를 파싱하지 않는다. 공백이 있는 경로에서 `diff --git a/… b/…`의 경계를 확정할 수 없기 때문에, 경로는 항상 `--name-status -z` 결과를 쓴다.
- 한글 경로가 C-escape되지 않도록 모든 git 호출에 `-c core.quotepath=false`를 넣는다.

## 테스트

```bash
npm run test:unit
```

- `test/fixtures/create-repo.sh` — rename, merge, binary, 한글·공백 경로, root commit, 개행 없는 파일, remote ref를 포함한 저장소를 만든다
- `test/fixtures/git-output/*.bin` — 위 저장소에서 실제로 뽑은 git 출력. 파서 테스트는 손으로 쓴 문자열이 아니라 이 바이트를 읽는다
- `test/unit/services/gitServices.test.ts` — 임시 저장소를 만들어 서비스 계층을 실제 `git` 프로세스로 검증한다 (vitest alias로 `vscode`를 스텁으로 바꾼다)

fixture를 다시 뜨려면:

```bash
sh test/fixtures/create-repo.sh /tmp/gwb-repo
node test/fixtures/capture.mjs /tmp/gwb-repo
```

## 제한

조회 전용이다. 다음은 포함하지 않는다.

- cherry-pick, merge, reset, revert 등 쓰기 기능, staging/unstaging, interactive rebase
- line-level blame UI, GitHub/GitLab 연동, commit 서명 검증, worktree/submodule 탐색
- working tree / index의 미커밋 변경 (commit 이력만 표시한다)
- commit graph는 최소 lane 배치만 한다. IntelliJ와 같은 배치를 재현하지 않으며, pagination 경계에서 화면 밖 parent는 아래로 이어지는 선으로만 표시된다
- Git Log pagination은 `--skip` 기반이다. 매우 큰 저장소에서는 뒤쪽 페이지가 느려질 수 있고, 페이지를 넘기는 사이에 새 커밋이 들어오면 경계가 어긋날 수 있다

신뢰되지 않은 workspace에서는 활성화되지 않는다.

## 라이선스

MIT
