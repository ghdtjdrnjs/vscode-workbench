# Git Workbench

IntelliJ IDEA의 **File History** / **Git Log** 경험을 VS Code 하단 Panel에서 제공하는 확장이다.

조회가 중심이고, 저장소를 바꾸는 기능은 **cherry-pick 하나뿐**이다.

## 기능

### File History

에디터나 Explorer에서 파일을 우클릭 → **Git Workbench → Show File History**.

- 왼쪽: 해당 파일의 커밋 이력 (작성자 / 날짜 / 커밋 메시지 / 짧은 hash)
- 오른쪽: 선택한 커밋의 파일 diff
- rename 이전 이력까지 `--follow`로 추적하고, 각 항목에 그 시점의 경로를 보관한다
- `변경 구간` / `전체 파일` 전환
- `통합` / `나란히` 전환
- 전체 파일 보기에서 변경되지 않은 구간은 접히고, 위·아래·전체 단위로 펼칠 수 있다
- 툴바의 `편집기에서 열기`로 같은 diff를 VS Code 편집기에서 연다
- 추가 / 수정 / 삭제 / rename / binary / root commit 처리
- merge commit은 비교할 parent를 고를 수 있다

### Git Log

진입 방법 세 가지:

- **상태 표시줄 왼쪽의 `⎇ Git Workbench` 버튼** (IntelliJ 좌측 하단 Git 버튼에 해당)
- 하단 패널의 **`GIT WORKBENCH` 탭** (`PROBLEMS` · `OUTPUT` · `TERMINAL` 옆)
- 명령 팔레트 → `Git Workbench: Open Git Log`

VS Code에는 IntelliJ 같은 좌측 툴윈도우 버튼이 없다. Panel view container는 하단 탭으로만 노출되므로, 항상 보이는 진입점은 상태 표시줄에 둔다.

- 왼쪽: local / remote / tag 브랜치 목록, 현재 브랜치 표시, `origin/HEAD` 같은 symbolic ref는 숨김
- 가운데: 커밋 목록 + 최소 commit graph, 브랜치·작성자·날짜 범위·메시지 검색, 무한 스크롤 pagination
- 오른쪽: 커밋 상세 (메시지 본문, 작성자, 날짜, full hash, 포함 브랜치, 변경 파일)
- 변경 파일을 더블클릭하거나 Enter를 누르면 **VS Code 기본 diff 편집기**에서 열린다. 하단 패널은 폭이 좁아 코드를 읽기 어렵고, 편집기에서는 구문 강조·검색·접기가 모두 동작한다
- 커밋 메시지 칸에 **commit hash**를 넣으면 해당 커밋을 찾는다 (전체 hash · 짧은 hash · 대소문자 무관). 브랜치 필터와 무관하게 동작한다
- 브랜치 목록은 기본으로 접혀 있다. 좌측 세로 막대의 `›`로 펼치고 `‹`로 접는다
- 영역 경계를 끌어 크기를 조절한다. 커밋 상세 안에서도 메시지 영역과 변경 파일 목록을 위아래로 나눌 수 있다. 경계를 더블클릭하면 기본 비율로 돌아간다
- 모든 영역의 최소 크기는 80px로 같다. 로드된 내용이 무엇이든 한계가 달라지지 않는다

### Cherry-Pick

커밋 목록에서 커밋을 **우클릭 → Cherry-Pick**.

- 실행 전 확인 대화상자를 띄운다
- 커밋되지 않은 변경이 있으면 시작하지 않는다
- 이미 진행 중인 cherry-pick이 있으면 거부한다
- 충돌이 나면 오류가 아니라 안내로 알리고, `--continue` / `--abort` 방법을 알려 준다
- 변경 내용이 이미 반영되어 있으면 빈 커밋을 만들지 않고 알린다

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

## 개발 루프

고칠 때마다 패키징하고 설치할 필요는 없다. `npm run package`는 타입 검사·lint·테스트 89건·production 번들·VSIX를 모두 돌려서 14초가 걸리고, 여기에 설치와 창 새로고침이 더 붙는다. 릴리스할 때 쓰는 명령이다.

개발 중에는 Extension Development Host를 쓴다. 번들만 다시 만들면 되므로 0.3초다.

1. `Run and Debug`(<kbd>⌘⇧D</kbd>)에서 **Run Extension (watch)** 선택 → ▶
2. 새 창이 뜨면 Git 저장소가 있는 폴더를 연다
3. 코드를 고치면 esbuild가 자동으로 다시 빌드한다
4. 새 창에서 <kbd>⌘R</kbd>(`Developer: Reload Window`) → 반영 완료

webview만 고쳤을 때도 <kbd>⌘R</kbd>이 필요하다. `media/webview.js`는 창을 열 때 읽힌다.

VS Code를 띄우지 않고 webview만 브라우저에서 확인할 수도 있다. 레이아웃과 드래그 문제는 VS Code가 아니라 브라우저 엔진에서 재현된다.

```bash
npm run harness   # http://127.0.0.1:8777/test/harness/
```

`test/harness/index.html`이 Extension Host 대신 가짜 응답을 돌려준다. 긴 커밋 제목과 긴 diff 줄이 들어 있어 폭이 밀리는 문제를 재현하기 좋다.

webview를 디버깅하려면 새 창에서 `Developer: Open Webview Developer Tools`를 실행한다. 콘솔·요소 검사·CSP 위반 확인이 모두 여기서 된다. Extension Host 쪽 로그는 `출력` 패널의 `Git Workbench` 채널에 쌓인다.

설치본까지 갱신해야 할 때만:

```bash
npm run package && code --install-extension git-workbench-0.0.1.vsix --force
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
- 과거 파일 내용은 `git-workbench:` 읽기 전용 스킴으로 편집기에 넘긴다. URI의 path에 실제 파일 경로를 넣어야 편집기가 언어를 알아보고 구문 강조를 한다. 추가·삭제된 쪽은 빈 문서로 연다.
- 한 번 workbench를 그린 뒤에는 화면 전체를 다른 화면으로 교체하지 않는다. 갱신 도중 내장 Git이 잠깐 저장소를 0개로 보고하거나 요청이 한 번 실패하는 일이 있는데, 그때마다 트리를 통째로 갈면 화면 전체가 사라졌다 돌아온다. 그런 상태는 탭 바의 작은 표시로만 알린다.
- webview effect의 의존성은 객체가 아니라 hash·경로 문자열로 둔다. 목록을 다시 읽으면 내용이 같아도 객체가 새로 만들어져서, 객체에 의존하면 상세와 diff가 매번 다시 로드되며 화면이 깜빡인다. 같은 이유로 목록 내용이 동일하면 배열 자체를 갈아 끼우지 않는다.
- 분할 영역의 크기는 드래그 비율만으로 정한다. 첫 번째 pane은 `flex: 0 0 auto`로 두어 shrink를 막고, flex 사슬 전체에 `min-width: 0`을 준다. 이게 없으면 반대쪽 내용의 min-content 크기가 최소 폭이 되어, 긴 diff 줄 하나 때문에 divider가 왼쪽으로 튀고 다시 오른쪽으로 가지 않는다.
- divider는 마우스의 절대 위치가 아니라 잡은 순간부터의 이동량으로 움직인다. 절대 위치로 다시 계산하면 손잡이를 잡은 지점과 계산 위치가 어긋날 때 첫 이동에서 선이 순간이동한다.
- 최소 크기는 비율이 아니라 px로 둔다. 비율이면 패널이 커질수록 최소 폭도 같이 커져서 한계가 상황마다 달라진다.
- 저장소 변경 알림은 700ms로 묶고, 저장소 목록·현재 브랜치·HEAD commit이 실제로 바뀐 경우에만 보낸다. 내장 Git extension의 state 이벤트는 파일 저장마다 울린다.

## 테스트

```bash
npm run test:unit
```

- `test/fixtures/create-repo.sh` — rename, merge, binary, 한글·공백 경로, root commit, 개행 없는 파일, remote ref를 포함한 저장소를 만든다
- `test/fixtures/git-output/*.bin` — 위 저장소에서 실제로 뽑은 git 출력. 파서 테스트는 손으로 쓴 문자열이 아니라 이 바이트를 읽는다
- `test/unit/services/gitServices.test.ts` — 임시 저장소를 만들어 서비스 계층을 실제 `git` 프로세스로 검증한다 (vitest alias로 `vscode`를 스텁으로 바꾼다)
- `test/unit/webview/splitPane.test.ts` — 분할 영역 한계가 컨테이너 크기와 무관하게 항상 같은 px인지 확인한다
- `test/unit/webview/appShell.test.tsx` — 갱신이 실패하거나 저장소를 0개로 보고해도 workbench가 언마운트되지 않는지 확인한다
- `test/unit/webview/flicker.test.tsx` — jsdom에서 페이지 컴포넌트를 실제로 렌더링해 갱신 동작을 검증한다. 같은 데이터로 갱신했을 때 상세와 diff를 다시 읽지 않아야 하고, 저장소·파일이 바뀌면 이전 결과가 남지 않아야 한다. 화면을 눈으로 보지 않고 깜빡임의 원인을 직접 확인하는 테스트다

fixture를 다시 뜨려면:

```bash
sh test/fixtures/create-repo.sh /tmp/gwb-repo
node test/fixtures/capture.mjs /tmp/gwb-repo
```

## 제한

조회 전용이다. 다음은 포함하지 않는다.

- merge, reset, revert, staging/unstaging, interactive rebase (쓰기 기능 중 cherry-pick만 지원한다)
- line-level blame UI, GitHub/GitLab 연동, commit 서명 검증, worktree/submodule 탐색
- working tree / index의 미커밋 변경 (commit 이력만 표시한다)
- commit graph는 최소 lane 배치만 한다. IntelliJ와 같은 배치를 재현하지 않으며, pagination 경계에서 화면 밖 parent는 아래로 이어지는 선으로만 표시된다
- Git Log pagination은 `--skip` 기반이다. 매우 큰 저장소에서는 뒤쪽 페이지가 느려질 수 있고, 페이지를 넘기는 사이에 새 커밋이 들어오면 경계가 어긋날 수 있다

신뢰되지 않은 workspace에서는 활성화되지 않는다. 이때 패널은 비어 있지 않고 이유를 표시한다.

## 패널이 비어 있을 때

활성화에 실패하면 패널에 이유가 나온다. 그래도 완전히 비어 있다면 확장이 아예 로드되지 않은 것이다.

1. `출력` 패널 → `Git Workbench` 채널에 `[activate] 시작`이 있는지 확인한다. 없으면 확장이 활성화되지 않았다.
2. `도움말` → `개발자 도구 전환` → 콘솔에서 `git-workbench` 관련 오류를 찾는다.
3. `확장` 뷰에서 `Git Workbench`가 설치·활성 상태인지 확인한다.

가장 흔한 원인은 설치 후 창을 다시 로드하지 않은 것이다.

## 라이선스

MIT
