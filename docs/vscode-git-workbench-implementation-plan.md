# VS Code Git Workbench Extension 구현 계획서

> IntelliJ IDEA의 **File History** 및 **Git Log** 경험을 참고하여, VS Code 하단 Panel 안에서 파일 변경 이력·커밋 로그·브랜치·커밋 상세·파일 diff를 제공하는 커스텀 Extension을 구현한다.

---

## 문서 정보

| 항목 | 내용 |
|---|---|
| 프로젝트 가칭 | `git-workbench` |
| 주요 언어 | TypeScript |
| Extension 실행 환경 | VS Code Extension Host |
| UI | React 기반 Webview View |
| Git 연동 | VS Code 내장 Git API + Git CLI |
| 패키지 매니저 | npm |
| 번들러 | esbuild |
| 초기 배포 대상 | VSIX 로컬 설치 |

---

## 1. 프로젝트 목표

### 1.1 구현할 핵심 기능

#### 기능 A — File History

열려 있는 파일 또는 Explorer에서 선택한 파일을 우클릭한 뒤 다음 경로로 실행한다.

```text
우클릭
└─ Git Workbench
   └─ Show File History
```

실행하면 하단 Panel에 해당 파일의 수정 이력이 표시된다.

```text
┌───────────────────────────┬────────────────────────────────────┐
│ 파일 수정 이력             │ 선택한 커밋 기준 파일 diff          │
│                           │                                    │
│ 작성자                     │ [변경 구간] [전체 파일]             │
│ 날짜                       │ [통합] [나란히]                    │
│ 커밋 메시지                │                                    │
│ 커밋 해시                  │ 변경되지 않은 구간은 접기/펼치기    │
└───────────────────────────┴────────────────────────────────────┘
```

필수 동작:

- 파일 rename 이전 이력까지 가능한 범위에서 추적
- 커밋 목록에서 작성자, 날짜, 커밋 메시지, 짧은 hash 표시
- 커밋 선택 시 해당 커밋에서의 파일 diff 표시
- 변경된 구간만 보기
- 전체 파일 보기
- 변경되지 않은 구간 접기/펼치기
- 추가·수정·삭제·rename·binary 파일 처리
- merge commit의 비교 parent 선택 지원

#### 기능 B — Git Log

하단 Panel에 IntelliJ Git 탭과 유사한 3단 레이아웃을 제공한다.

```text
┌─────────────────┬─────────────────────────────┬────────────────────────┐
│ 브랜치 목록      │ 전체 커밋 이력              │ 선택한 커밋 상세         │
│                 │                             │                        │
│ Local           │ commit graph               │ 커밋 메시지              │
│ Remote          │ 작성자                      │ 작성자/날짜/hash          │
│ Tags(선택)      │ 날짜                        │ 포함 브랜치               │
│                 │ 커밋 메시지                 │ 변경 파일 목록            │
│                 │                             │                        │
│                 │ branch/user/date/message    │ 파일 더블클릭 → diff      │
│                 │ 검색                        │                        │
└─────────────────┴─────────────────────────────┴────────────────────────┘
```

필수 동작:

- local branch, remote branch 목록 표시
- 선택한 branch 기준 커밋 목록 조회
- 전체 refs 기준 커밋 목록 조회
- 브랜치, 작성자, 날짜 범위, 커밋 메시지 검색
- 검색 조건 변경 시 기존 요청 취소
- 커밋 선택 시 상세 정보 표시
- 커밋이 포함된 브랜치 목록 표시
- 변경 파일 목록 표시
- 변경 파일 더블클릭 시 해당 파일 diff 표시
- merge commit의 비교 parent 선택 지원
- 커밋 목록 pagination 또는 무한 스크롤

---

## 2. 초기 범위와 제외 범위

### 2.1 MVP 범위

첫 번째 동작 가능한 버전은 아래 흐름을 완성하는 것을 목표로 한다.

```text
파일 우클릭
→ Show File History
→ 현재 파일의 Git 저장소 판별
→ 파일 이력 조회
→ 왼쪽 커밋 목록 표시
→ 커밋 선택
→ 오른쪽 unified diff 표시
```

MVP에는 다음을 포함한다.

- 단일 repository
- multi-root workspace 기본 지원
- 파일 수정 이력
- unified diff
- local/remote branch 목록
- commit log
- commit detail
- 변경 파일 diff
- 기본 검색 및 pagination

### 2.2 초기 버전에서 제외하거나 후순위로 둘 기능

- IntelliJ와 완전히 동일한 commit graph lane 알고리즘
- interactive rebase
- cherry-pick, merge, reset, revert 등 쓰기 기능
- staging/unstaging
- line-level blame UI
- GitHub/GitLab API 연동
- pull request 정보
- commit 서명 검증 UI
- worktree 관리 UI
- submodule 내부 history 탐색
- 대규모 binary diff 미리보기

초기 설계는 조회 전용으로 유지한다. Git repository를 변경하는 기능은 별도의 버전에서 추가한다.

---

## 3. 사용자 시나리오

### 3.1 파일 이력 조회

```gherkin
Given 사용자가 Git repository 안의 파일을 열어 두었다
When 에디터에서 우클릭 후 Git Workbench > Show File History를 누른다
Then 하단 Git Workbench Panel이 열린다
And File History 탭이 선택된다
And 왼쪽에 해당 파일의 커밋 이력이 최신순으로 표시된다
When 사용자가 커밋 하나를 선택한다
Then 오른쪽에 선택한 커밋과 이전 상태 사이의 파일 diff가 표시된다
```

### 3.2 Explorer 파일 이력 조회

```gherkin
Given Explorer에 Git repository의 파일이 표시되어 있다
When 사용자가 파일을 우클릭하고 Show File History를 누른다
Then 선택된 URI 기준으로 File History가 열린다
```

### 3.3 전체 Git Log 조회

```gherkin
Given workspace에 하나 이상의 Git repository가 있다
When 사용자가 Git Workbench Panel을 연다
Then 현재 repository의 local/remote branch 목록이 표시된다
And 중앙에 최근 commit 목록이 표시된다
```

### 3.4 커밋 검색

```gherkin
Given commit log가 열려 있다
When 사용자가 branch, author, 날짜, message 검색 조건을 입력한다
Then 300ms debounce 후 Git 조회가 실행된다
And 이전 검색 프로세스는 취소된다
And 검색 결과만 commit 목록에 표시된다
```

### 3.5 커밋 상세 및 파일 diff

```gherkin
Given commit 목록이 표시되어 있다
When 사용자가 commit을 클릭한다
Then 오른쪽에 commit metadata, 포함 branch, 변경 파일이 표시된다
When 변경 파일을 더블클릭한다
Then 오른쪽 상세 영역이 해당 파일 diff 화면으로 전환된다
And 뒤로 가기 버튼으로 commit 상세 화면으로 돌아갈 수 있다
```

---

## 4. 전체 아키텍처

```text
┌──────────────────────────────────────────────────────────────┐
│ VS Code UI                                                   │
│                                                              │
│ editor/context, explorer/context                             │
│           │                                                  │
│           ▼                                                  │
│ Bottom Panel View Container                                  │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ React Webview View                                       │ │
│ │                                                          │ │
│ │ File History / Git Log / Commit Detail / Diff Viewer     │ │
│ └───────────────────────────┬──────────────────────────────┘ │
└─────────────────────────────┼────────────────────────────────┘
                              │ typed JSON message
┌─────────────────────────────▼────────────────────────────────┐
│ VS Code Extension Host                                      │
│                                                              │
│ CommandController                                            │
│ GitWorkbenchViewProvider                                     │
│ MessageRouter                                                │
│ RepositoryResolver                                           │
│ FileHistoryService                                           │
│ CommitLogService                                             │
│ CommitDetailService                                          │
│ DiffService                                                  │
│ GitProcessRunner                                             │
│ Query Cache / Cancellation                                   │
└─────────────────────────────┬────────────────────────────────┘
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
       VS Code Built-in Git API           Git CLI
       - repository 탐색                   - log
       - git executable path              - diff
       - repository events                - for-each-ref
       - buffer/show 보조                 - diff-tree
```

### 4.1 책임 분리

#### Webview가 담당할 것

- 레이아웃
- 탭 및 화면 상태
- commit/branch/file list 렌더링
- 검색 입력
- list virtualization
- diff hunk 렌더링
- unchanged region 접기/펼치기
- selection 상태
- loading/error/empty 상태

#### Extension Host가 담당할 것

- 현재 URI에 해당하는 repository 찾기
- Git executable path 결정
- Git command 실행
- stdout/stderr 파싱
- process 취소
- pagination
- cache
- repository 변경 이벤트 수신
- Webview message 검증 및 응답

#### Git CLI가 담당할 것

- 파일 history
- commit log
- branch/ref 조회
- commit 포함 branch 조회
- changed file 목록
- patch 생성

### 4.2 핵심 설계 원칙

1. UI 코드는 Git 명령을 알지 못한다.
2. Git 서비스는 React 상태를 알지 못한다.
3. 모든 Webview 통신은 명시적인 request/response type으로 관리한다.
4. 사용자 입력을 shell 문자열에 합치지 않는다.
5. 큰 결과를 한 번에 모두 읽지 않는다.
6. 검색 조건이 바뀌면 이전 프로세스를 취소한다.
7. commit hash와 path를 문자열 key로 캐시하되 repository 단위로 격리한다.
8. rename, merge, root commit을 처음부터 데이터 모델에 반영한다.

---

## 5. 권장 기술 스택

| 영역 | 선택 |
|---|---|
| Extension | TypeScript, VS Code Extension API |
| Webview | React, TypeScript |
| 상태 관리 | React Context + reducer 또는 Zustand 중 하나 |
| Styling | CSS Modules 또는 단일 CSS + VS Code theme variable |
| Bundling | esbuild |
| Unit Test | Vitest 또는 Mocha |
| Extension Integration Test | `@vscode/test-cli`, `@vscode/test-electron` |
| Git 실행 | Node.js `child_process.spawn` |
| 목록 가상화 | `react-window` 또는 직접 구현 |
| Diff parsing | 자체 unified diff parser 또는 검증된 경량 라이브러리 |

초기에는 상태 관리 라이브러리를 필수로 넣지 않아도 된다. 화면 수가 늘어날 경우에만 Zustand 등을 추가한다.

---

## 6. 프로젝트 생성

### 6.1 Extension 프로젝트 생성

```bash
npx --package yo --package generator-code -- yo code
```

권장 선택값:

```text
New Extension (TypeScript)
Extension name: git-workbench
Identifier: git-workbench
Initialize git repository: Yes
Package manager: npm
```

### 6.2 의존성 설치

```bash
npm install react react-dom
npm install --save-dev \
  esbuild \
  @types/react \
  @types/react-dom \
  vitest \
  @vscode/test-cli \
  @vscode/test-electron
```

목록 가상화를 사용할 경우:

```bash
npm install react-window
npm install --save-dev @types/react-window
```

### 6.3 권장 스크립트

```jsonc
{
  "scripts": {
    "check-types": "tsc --noEmit",
    "lint": "eslint src webview",
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "test:unit": "vitest run",
    "test:extension": "vscode-test",
    "package": "npm run check-types && npm run test:unit && npm run build && vsce package"
  }
}
```

---

## 7. 권장 디렉터리 구조

```text
git-workbench/
├─ package.json
├─ tsconfig.json
├─ esbuild.mjs
├─ README.md
├─ CHANGELOG.md
├─ resources/
│  └─ git.svg
├─ media/
│  ├─ webview.js
│  └─ webview.css
├─ src/
│  ├─ extension.ts
│  ├─ api/
│  │  └─ git.d.ts
│  ├─ commands/
│  │  └─ registerCommands.ts
│  ├─ git/
│  │  ├─ GitApiProvider.ts
│  │  ├─ GitProcessRunner.ts
│  │  ├─ RepositoryResolver.ts
│  │  ├─ FileHistoryService.ts
│  │  ├─ CommitLogService.ts
│  │  ├─ CommitDetailService.ts
│  │  ├─ DiffService.ts
│  │  ├─ GitQueryCache.ts
│  │  └─ parsers/
│  │     ├─ fileHistoryParser.ts
│  │     ├─ commitLogParser.ts
│  │     ├─ refParser.ts
│  │     ├─ nameStatusParser.ts
│  │     └─ patchParser.ts
│  ├─ panel/
│  │  ├─ GitWorkbenchViewProvider.ts
│  │  ├─ MessageRouter.ts
│  │  ├─ getWebviewHtml.ts
│  │  └─ nonce.ts
│  └─ shared/
│     ├─ models.ts
│     ├─ protocol.ts
│     ├─ errors.ts
│     └─ constants.ts
├─ webview/
│  ├─ index.tsx
│  ├─ App.tsx
│  ├─ vscode.ts
│  ├─ state/
│  │  ├─ store.ts
│  │  └─ reducer.ts
│  ├─ features/
│  │  ├─ fileHistory/
│  │  │  ├─ FileHistoryPage.tsx
│  │  │  ├─ FileHistoryList.tsx
│  │  │  └─ fileHistoryState.ts
│  │  ├─ commitLog/
│  │  │  ├─ CommitLogPage.tsx
│  │  │  ├─ BranchTree.tsx
│  │  │  ├─ CommitList.tsx
│  │  │  ├─ CommitSearchBar.tsx
│  │  │  └─ CommitDetails.tsx
│  │  └─ diff/
│  │     ├─ DiffViewer.tsx
│  │     ├─ UnifiedDiff.tsx
│  │     ├─ SideBySideDiff.tsx
│  │     └─ CollapsedRegion.tsx
│  └─ components/
│     ├─ SplitPane.tsx
│     ├─ Loading.tsx
│     ├─ EmptyState.tsx
│     └─ ErrorState.tsx
└─ test/
   ├─ unit/
   │  ├─ parsers/
   │  └─ services/
   ├─ fixtures/
   │  ├─ logs/
   │  ├─ patches/
   │  └─ repositories/
   └─ extension/
```

---

## 8. VS Code Contribution 설계

`package.json`에 다음 영역을 등록한다.

- command
- context menu submenu
- 하단 Panel View Container
- Webview View
- refresh command
- 내장 Git extension dependency
- workspace trust 정책

### 8.1 package.json 예시

```jsonc
{
  "name": "git-workbench",
  "displayName": "Git Workbench",
  "description": "File history and repository log inspired by IntelliJ Git tools.",
  "version": "0.0.1",
  "engines": {
    "vscode": "^1.95.0"
  },
  "categories": ["SCM Providers", "Other"],
  "main": "./dist/extension.js",
  "extensionKind": ["workspace"],
  "extensionDependencies": ["vscode.git"],
  "activationEvents": [],
  "capabilities": {
    "untrustedWorkspaces": {
      "supported": false,
      "description": "Git Workbench executes Git commands in the current workspace."
    }
  },
  "contributes": {
    "commands": [
      {
        "command": "gitWorkbench.showFileHistory",
        "category": "Git Workbench",
        "title": "Show File History"
      },
      {
        "command": "gitWorkbench.openLog",
        "category": "Git Workbench",
        "title": "Open Git Log"
      },
      {
        "command": "gitWorkbench.refresh",
        "category": "Git Workbench",
        "title": "Refresh"
      }
    ],
    "submenus": [
      {
        "id": "gitWorkbench.contextMenu",
        "label": "Git Workbench"
      }
    ],
    "menus": {
      "editor/context": [
        {
          "submenu": "gitWorkbench.contextMenu",
          "group": "navigation@90"
        }
      ],
      "explorer/context": [
        {
          "submenu": "gitWorkbench.contextMenu",
          "when": "resourceScheme == file && !explorerResourceIsFolder",
          "group": "3_compare@90"
        }
      ],
      "gitWorkbench.contextMenu": [
        {
          "command": "gitWorkbench.showFileHistory",
          "group": "history@1"
        }
      ],
      "view/title": [
        {
          "command": "gitWorkbench.refresh",
          "when": "view == gitWorkbench.main",
          "group": "navigation"
        }
      ]
    },
    "viewsContainers": {
      "panel": [
        {
          "id": "gitWorkbench",
          "title": "Git Workbench",
          "icon": "resources/git.svg"
        }
      ]
    },
    "views": {
      "gitWorkbench": [
        {
          "type": "webview",
          "id": "gitWorkbench.main",
          "name": "Repository"
        }
      ]
    },
    "configuration": {
      "title": "Git Workbench",
      "properties": {
        "gitWorkbench.commitPageSize": {
          "type": "number",
          "default": 200,
          "minimum": 20,
          "maximum": 1000,
          "description": "Number of commits loaded per page."
        },
        "gitWorkbench.fileHistoryPageSize": {
          "type": "number",
          "default": 100,
          "minimum": 20,
          "maximum": 500,
          "description": "Number of file history entries loaded per page."
        },
        "gitWorkbench.maxTextFileBytes": {
          "type": "number",
          "default": 2097152,
          "minimum": 65536,
          "description": "Maximum text file size loaded into the full-file diff viewer."
        }
      }
    }
  }
}
```

### 8.2 활성화 코드의 역할

`src/extension.ts`는 복잡한 업무 로직을 두지 않고 다음만 담당한다.

1. 내장 Git extension API 활성화
2. service 조립
3. Webview View Provider 등록
4. command 등록
5. repository 이벤트 구독
6. dispose 처리

```ts
import * as vscode from 'vscode';
import type { GitExtension, API as GitApi } from './api/git';
import { GitWorkbenchViewProvider } from './panel/GitWorkbenchViewProvider';
import { registerCommands } from './commands/registerCommands';

const VIEW_ID = 'gitWorkbench.main';

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');

  if (!extension) {
    throw new Error('VS Code built-in Git extension is unavailable.');
  }

  const exports = await extension.activate();
  const gitApi: GitApi = exports.getAPI(1);

  const provider = GitWorkbenchViewProvider.create({
    context,
    gitApi,
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }),
  );

  context.subscriptions.push(
    ...registerCommands({
      provider,
      viewId: VIEW_ID,
    }),
  );
}

export function deactivate(): void {
  // context.subscriptions에 등록된 리소스는 VS Code가 정리한다.
}
```

---

## 9. 공통 데이터 모델

`src/shared/models.ts`는 Extension Host와 Webview가 함께 import한다.

### 9.1 Repository 모델

```ts
export interface RepositoryInfo {
  id: string;
  rootUri: string;
  name: string;
  headName?: string;
  headCommit?: string;
}
```

`id`는 repository root URI를 안정적으로 hash하거나 그대로 사용한다.

### 9.2 Branch 모델

```ts
export type RefKind = 'local' | 'remote' | 'tag';

export interface BranchRef {
  fullName: string;
  shortName: string;
  kind: RefKind;
  commitHash: string;
  upstream?: string;
  isCurrent: boolean;
  isSymbolic: boolean;
}
```

### 9.3 Commit 모델

```ts
export interface CommitSummary {
  hash: string;
  shortHash: string;
  parentHashes: string[];
  authorName: string;
  authorEmail?: string;
  authorDate: string;
  committerDate?: string;
  subject: string;
  body?: string;
  decorations: string[];
}

export interface CommitDetail extends CommitSummary {
  containingBranches: BranchRef[];
  changedFiles: ChangedFile[];
}
```

### 9.4 변경 파일 모델

```ts
export type ChangeStatus =
  | 'A'
  | 'M'
  | 'D'
  | 'R'
  | 'C'
  | 'T'
  | 'U';

export interface ChangedFile {
  status: ChangeStatus;
  oldPath?: string;
  newPath: string;
  similarity?: number;
  isBinary?: boolean;
}
```

### 9.5 File History 모델

```ts
export interface FileHistoryEntry extends CommitSummary {
  pathAtCommit: string;
  previousPath?: string;
  status?: ChangeStatus;
}

export interface FileHistoryResult {
  repository: RepositoryInfo;
  requestedUri: string;
  relativePath: string;
  entries: FileHistoryEntry[];
  hasMore: boolean;
  nextCursor?: string;
}
```

### 9.6 Diff 모델

```ts
export type DiffViewMode = 'changes' | 'full';
export type DiffLayout = 'unified' | 'side-by-side';

export interface DiffFileVersion {
  revision?: string;
  path?: string;
  text?: string;
  size?: number;
  exists: boolean;
}

export interface DiffLine {
  type: 'context' | 'add' | 'delete' | 'meta';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffModel {
  repositoryId: string;
  oldFile: DiffFileVersion;
  newFile: DiffFileVersion;
  status: ChangeStatus;
  hunks: DiffHunk[];
  binary: boolean;
  truncated: boolean;
  truncationReason?: string;
}
```

---

## 10. Webview 통신 프로토콜

### 10.1 원칙

- 모든 요청에 `requestId`를 넣는다.
- 모든 응답은 원래 `requestId`를 반환한다.
- 동일 영역에 새 요청이 오면 이전 요청을 취소한다.
- Webview가 보낸 URI, hash, path, 숫자 범위를 검증한다.
- 알 수 없는 message type은 무시하지 말고 개발 모드에서 로그를 남긴다.

### 10.2 Request 예시

```ts
export type WebviewRequest =
  | {
      type: 'repository/list';
      requestId: string;
    }
  | {
      type: 'repository/select';
      requestId: string;
      repositoryId: string;
    }
  | {
      type: 'fileHistory/load';
      requestId: string;
      uri: string;
      limit: number;
      cursor?: string;
    }
  | {
      type: 'fileHistory/selectCommit';
      requestId: string;
      repositoryId: string;
      commitHash: string;
      parentIndex: number;
      oldPath?: string;
      newPath: string;
    }
  | {
      type: 'refs/load';
      requestId: string;
      repositoryId: string;
    }
  | {
      type: 'commitLog/search';
      requestId: string;
      repositoryId: string;
      filters: CommitFilters;
      cursor?: string;
      limit: number;
    }
  | {
      type: 'commitDetail/load';
      requestId: string;
      repositoryId: string;
      commitHash: string;
      parentIndex: number;
    }
  | {
      type: 'commitFile/openDiff';
      requestId: string;
      repositoryId: string;
      commitHash: string;
      parentIndex: number;
      oldPath?: string;
      newPath: string;
    }
  | {
      type: 'request/cancel';
      requestId: string;
      targetRequestId: string;
    };

export interface CommitFilters {
  ref?: string;
  author?: string;
  since?: string;
  until?: string;
  message?: string;
  allRefs: boolean;
}
```

### 10.3 Response 예시

```ts
export type ExtensionResponse =
  | {
      type: 'repository/listResult';
      requestId: string;
      repositories: RepositoryInfo[];
    }
  | {
      type: 'fileHistory/result';
      requestId: string;
      result: FileHistoryResult;
    }
  | {
      type: 'refs/result';
      requestId: string;
      refs: BranchRef[];
    }
  | {
      type: 'commitLog/result';
      requestId: string;
      commits: CommitSummary[];
      hasMore: boolean;
      nextCursor?: string;
    }
  | {
      type: 'commitDetail/result';
      requestId: string;
      detail: CommitDetail;
    }
  | {
      type: 'diff/result';
      requestId: string;
      diff: DiffModel;
    }
  | {
      type: 'request/error';
      requestId: string;
      code: string;
      message: string;
      recoverable: boolean;
    };
```

### 10.4 MessageRouter 책임

```text
Webview message 수신
→ schema/type 검증
→ requestId 기반 CancellationTokenSource 생성
→ type에 맞는 service 호출
→ 결과 postMessage
→ 완료 후 token 정리
→ 예외를 표준 error response로 변환
```

---

## 11. Repository 탐색

### 11.1 RepositoryResolver 책임

- active editor URI에서 repository 찾기
- Explorer command argument URI에서 repository 찾기
- multi-root workspace에서 가장 깊게 일치하는 repository 선택
- 파일이 repository 밖에 있는 경우 명확한 오류 반환
- repository root를 기준으로 상대 경로 계산
- Windows 경로 separator를 Git path 형식으로 정규화

### 11.2 예상 API

```ts
export interface ResolvedRepository {
  id: string;
  rootUri: vscode.Uri;
  relativePath?: string;
  gitRepository: Repository;
}

export class RepositoryResolver {
  public resolveUri(uri: vscode.Uri): ResolvedRepository;
  public getById(repositoryId: string): ResolvedRepository;
  public list(): ResolvedRepository[];
}
```

### 11.3 경로 처리 규칙

- Git command의 `cwd`는 repository root로 고정한다.
- 파일 경로는 repository root 기준 상대 경로를 전달한다.
- path 앞에 `--`를 넣어 revision과 path를 분리한다.
- 사용자 입력 branch/ref는 허용된 refs 목록에서 선택하도록 한다.
- 직접 텍스트 입력 ref를 받을 경우 `git rev-parse --verify`로 검증한다.

---

## 12. Git Process Runner

### 12.1 필수 조건

- `spawn` 사용
- `shell: false`
- 인자 배열 사용
- stdout은 Buffer로 수집
- stderr는 제한된 크기로 수집
- CancellationToken과 child process 연결
- exit code가 0이 아니면 표준 오류 객체로 변환
- 명령 실행 시간과 인자를 OutputChannel에 기록하되 민감 정보는 제거

### 12.2 기본 구현 예시

```ts
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';

export interface GitResult {
  stdout: Buffer;
  stderr: string;
}

export class GitProcessRunner {
  public constructor(
    private readonly gitPath: string,
    private readonly output: vscode.OutputChannel,
  ) {}

  public run(
    cwd: string,
    args: readonly string[],
    token?: vscode.CancellationToken,
  ): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const child = spawn(this.gitPath, ['--no-pager', ...args], {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GIT_OPTIONAL_LOCKS: '0',
          LC_ALL: 'C',
        },
      });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let settled = false;

      const cancellation = token?.onCancellationRequested(() => {
        if (!settled) {
          child.kill();
        }
      });

      child.stdout.on('data', chunk => {
        stdout.push(Buffer.from(chunk));
      });

      child.stderr.on('data', chunk => {
        stderr.push(Buffer.from(chunk));
      });

      child.once('error', error => {
        settled = true;
        cancellation?.dispose();
        reject(error);
      });

      child.once('close', code => {
        settled = true;
        cancellation?.dispose();

        const stderrText = Buffer.concat(stderr).toString('utf8');
        this.output.appendLine(
          `[git] ${args[0] ?? ''} finished in ${Date.now() - startedAt}ms`,
        );

        if (token?.isCancellationRequested) {
          reject(new vscode.CancellationError());
          return;
        }

        if (code !== 0) {
          reject(
            new Error(`Git exited with code ${code}: ${stderrText}`),
          );
          return;
        }

        resolve({
          stdout: Buffer.concat(stdout),
          stderr: stderrText,
        });
      });
    });
  }
}
```

### 12.3 추가 보완 사항

- Windows에서 kill이 즉시 동작하지 않는 경우 child process tree 종료 방식을 검토한다.
- stdout 최대 크기 제한을 둘 수 있다.
- 대형 결과는 향후 streaming parser로 전환할 수 있도록 runner와 parser를 분리한다.
- password prompt나 credential prompt가 발생하지 않도록 조회 명령만 사용한다.

---

## 13. Git 명령 설계

> 실제 구현에서는 포맷 구분자로 NUL(`%x00`)을 사용한다. 단순 개행 split은 파일명·커밋 본문·특수문자에서 깨질 수 있다.

### 13.1 파일 이력 조회

기본 형태:

```bash
git log \
  --follow \
  --date=iso-strict \
  --name-status \
  -M \
  -z \
  --format=<NUL-separated-format> \
  -- path/to/file
```

권장 metadata:

```text
record marker
full hash
parent hashes
author name
author email
author date
committer date
subject
decorations
```

고려 사항:

- `--follow`는 단일 파일에만 사용한다.
- rename 경로를 각 entry에 저장한다.
- root commit도 목록에 포함한다.
- pagination을 위해 초기에는 `--max-count`를 사용한다.
- 단순 `--skip`은 큰 history에서 비효율적일 수 있으므로 후속 버전에서 cursor commit 기반 조회를 검토한다.

### 13.2 branch/ref 목록

```bash
git for-each-ref \
  --sort=-committerdate \
  --format=<NUL-separated-format> \
  refs/heads \
  refs/remotes
```

필드 예시:

```text
refname
refname:short
objectname
HEAD marker
upstream:short
symref
committerdate:iso-strict
```

처리 규칙:

- `refs/heads/*` → local
- `refs/remotes/*` → remote
- symbolic `origin/HEAD`는 기본 화면에서 숨긴다.
- 현재 branch는 별도 marker로 표시한다.

### 13.3 commit log

```bash
git log \
  --all \
  --topo-order \
  --parents \
  --decorate=full \
  --date=iso-strict \
  --max-count=200 \
  --format=<NUL-separated-format>
```

검색 조건 매핑:

| UI 필드 | Git argument |
|---|---|
| 선택 branch | revision argument 또는 ref |
| 전체 refs | `--all` |
| 작성자 | `--author=<pattern>` |
| 시작 날짜 | `--since=<ISO date>` |
| 종료 날짜 | `--until=<ISO date>` |
| 커밋 메시지 | `--grep=<pattern>` |

검색 입력은 argument array로 전달한다. 정규식 여부는 제품 정책을 정해 UI에 표시한다. 초기에는 literal text 검색에 가까운 동작을 제공하고, 정규식 옵션은 후순위로 둔다.

### 13.4 commit metadata

```bash
git show \
  --no-patch \
  --date=iso-strict \
  --format=<NUL-separated-format> \
  <commit-hash>
```

### 13.5 commit 변경 파일

일반 commit:

```bash
git diff \
  --name-status \
  -M \
  -C \
  -z \
  <parent-hash> \
  <commit-hash>
```

root commit:

```bash
git diff-tree \
  --root \
  --no-commit-id \
  --name-status \
  -r \
  -M \
  -C \
  -z \
  <commit-hash>
```

### 13.6 commit 포함 branch

```bash
git for-each-ref \
  --contains=<commit-hash> \
  --format=<NUL-separated-format> \
  refs/heads \
  refs/remotes
```

### 13.7 파일 patch

```bash
git diff \
  --unified=3 \
  --no-ext-diff \
  --no-textconv \
  <parent-hash> \
  <commit-hash> \
  -- path/to/file
```

root commit의 파일은 빈 tree와 비교하거나 `git show --format= --patch` 계열로 분기한다.

### 13.8 파일 내용

선택지 A — 내장 Git API:

```ts
const oldBuffer = await repository.buffer(parentHash, oldPath);
const newBuffer = await repository.buffer(commitHash, newPath);
```

선택지 B — Git CLI:

```bash
git show <revision>:<path>
```

권장 방식:

- repository API의 `buffer`가 안정적으로 동작하면 우선 사용
- 오류 또는 특수 object 처리 시 CLI fallback
- path 문자열을 revision expression과 직접 합칠 경우 path 검증 필수

---

## 14. Parser 구현 규칙

### 14.1 공통 원칙

- parser는 VS Code API에 의존하지 않는다.
- `Buffer` 또는 `Uint8Array`를 입력받는다.
- invalid record를 조용히 무시하지 않는다.
- parser error에 command 이름과 record 위치를 포함한다.
- fixture 기반 unit test를 작성한다.

### 14.2 커밋 record marker

metadata 시작에 고유 marker를 넣어 `--name-status -z` 결과와 구분한다.

개념 예시:

```text
<NUL>__GWB_COMMIT__<NUL>
<hash><NUL>
<parents><NUL>
<author><NUL>
...
<name-status records>
```

### 14.3 name-status parser

상태별 token 수가 다르다.

```text
M <path>
A <path>
D <path>
R100 <oldPath> <newPath>
C087 <oldPath> <newPath>
```

파서는 다음을 추출한다.

- status letter
- rename/copy similarity
- old path
- new path

### 14.4 patch parser

다음 header를 처리한다.

```text
diff --git a/... b/...
new file mode
deleted file mode
similarity index
rename from
rename to
Binary files ... differ
@@ -oldStart,oldCount +newStart,newCount @@
```

line prefix:

```text
' ' context
'+' add
'-' delete
'\\' metadata: No newline at end of file
```

---

## 15. File History Service

### 15.1 API 초안

```ts
export interface LoadFileHistoryInput {
  uri: vscode.Uri;
  limit: number;
  cursor?: string;
}

export class FileHistoryService {
  public async load(
    input: LoadFileHistoryInput,
    token: vscode.CancellationToken,
  ): Promise<FileHistoryResult>;
}
```

### 15.2 처리 흐름

```text
URI 입력
→ RepositoryResolver.resolveUri
→ relative path 계산
→ git log --follow 실행
→ fileHistoryParser
→ rename chain 복원
→ FileHistoryResult 반환
```

### 15.3 File History 커밋 선택 시 diff 흐름

```text
사용자가 entry 선택
→ entry의 commitHash, parentIndex, oldPath/newPath 전달
→ parent 확인
→ root commit이면 빈 파일과 비교
→ rename이면 oldPath/newPath 분리
→ patch 조회
→ 필요 시 old/new 전체 text lazy load
→ DiffModel 반환
```

### 15.4 완료 조건

- 최근 commit이 첫 줄에 표시된다.
- author/date/subject/hash가 정확하다.
- rename된 파일에서 이전 경로 commit이 이어진다.
- 삭제된 파일의 old 내용이 표시된다.
- 추가된 파일의 new 내용이 표시된다.
- root commit diff가 표시된다.
- merge commit은 first parent를 기본으로 사용한다.
- 저장소 밖 파일은 사용자 친화적 오류를 표시한다.

---

## 16. Commit Log Service

### 16.1 API 초안

```ts
export interface CommitLogQuery {
  repositoryId: string;
  filters: CommitFilters;
  limit: number;
  cursor?: string;
}

export interface CommitLogPage {
  commits: CommitSummary[];
  hasMore: boolean;
  nextCursor?: string;
}

export class CommitLogService {
  public async load(
    query: CommitLogQuery,
    token: vscode.CancellationToken,
  ): Promise<CommitLogPage>;
}
```

### 16.2 초기 pagination 전략

초기 구현:

```text
페이지 1: --max-count=200
페이지 2: --max-count=200 --skip=200
```

후속 최적화 후보:

- 마지막 commit hash를 cursor로 사용
- selected ref와 topo-order를 유지하는 cursor 쿼리
- 이미 받은 commit deduplication

### 16.3 검색 동작

- 입력 변경 후 300ms debounce
- 새 요청 시작 전 이전 commit log 요청 취소
- 빈 검색 문자열은 argument에서 제외
- 날짜는 ISO 형식으로 Extension Host에 전송
- invalid 날짜는 Webview에서 먼저 차단
- 결과가 0개이면 empty state 표시

### 16.4 완료 조건

- local/remote branch를 선택할 수 있다.
- 전체 refs 보기와 단일 branch 보기가 동작한다.
- author 검색이 동작한다.
- date range 검색이 동작한다.
- message 검색이 동작한다.
- 조건을 조합할 수 있다.
- scroll 하단에서 다음 페이지를 로드한다.
- 중복 commit이 추가되지 않는다.
- 이전 요청 결과가 새 화면을 덮어쓰지 않는다.

---

## 17. Commit Detail Service

### 17.1 API 초안

```ts
export interface CommitDetailQuery {
  repositoryId: string;
  commitHash: string;
  parentIndex: number;
}

export class CommitDetailService {
  public async load(
    query: CommitDetailQuery,
    token: vscode.CancellationToken,
  ): Promise<CommitDetail>;
}
```

### 17.2 병렬 조회

commit을 선택하면 다음을 병렬로 조회한다.

```text
commit metadata
changed files against selected parent
containing branches
```

예시:

```ts
const [metadata, changedFiles, containingBranches] = await Promise.all([
  this.loadMetadata(...),
  this.loadChangedFiles(...),
  this.loadContainingBranches(...),
]);
```

### 17.3 merge commit 처리

`parentHashes.length > 1`이면 상세 화면에 selector를 표시한다.

```text
Compare with:
[ Parent 1: 1a2b3c4 ▼ ]
```

parent 변경 시:

- changed file 목록 다시 조회
- 열려 있는 diff 닫기 또는 다시 조회
- commit metadata와 containing branch는 재사용

### 17.4 완료 조건

- commit subject/body가 표시된다.
- full hash, author, author date가 표시된다.
- 포함 local/remote branch가 구분된다.
- 변경 파일 상태가 A/M/D/R/C로 표시된다.
- rename 파일은 old → new 경로를 표시한다.
- merge commit parent 변경 시 파일 목록이 달라진다.

---

## 18. Diff Service

### 18.1 API 초안

```ts
export interface DiffQuery {
  repositoryId: string;
  commitHash: string;
  parentIndex: number;
  oldPath?: string;
  newPath: string;
}

export class DiffService {
  public async loadPatch(
    query: DiffQuery,
    token: vscode.CancellationToken,
  ): Promise<DiffModel>;

  public async loadFullText(
    query: DiffQuery,
    token: vscode.CancellationToken,
  ): Promise<DiffModel>;
}
```

### 18.2 1단계 diff 기능

MVP에서는 다음만 구현한다.

- unified patch
- line number
- add/delete/context style
- binary 안내
- root commit
- rename path 표시

### 18.3 2단계 diff 기능

- side-by-side 보기
- full-file 모드
- unchanged region collapse
- 각 collapsed region 개별 펼치기
- 전체 펼치기/접기
- whitespace-only 변경 옵션

### 18.4 full-file 모드 구성 방식

patch hunk와 old/new 전체 text를 이용해 다음 segment를 만든다.

```ts
export type DiffSegment =
  | {
      type: 'collapsed';
      oldStart: number;
      newStart: number;
      count: number;
    }
  | {
      type: 'hunk';
      hunk: DiffHunk;
    };
```

hunk 사이의 unchanged gap이 임계값보다 크면 collapsed segment로 만든다.

예시 정책:

```text
hunk 전후 context: 3줄
10줄 이하 unchanged gap: 그대로 표시
11줄 이상 unchanged gap: 접어서 표시
```

### 18.5 binary 및 대용량 처리

```text
Binary file changed
old: path/to/file.bin
new: path/to/file.bin
```

텍스트 크기가 설정값을 초과하면:

```text
전체 파일 보기는 비활성화
변경 구간 patch만 표시
“File exceeds 2 MB full-view limit” 안내
```

### 18.6 완료 조건

- unified diff가 정확한 line number로 표시된다.
- file added/deleted/renamed 상태가 헤더에 표시된다.
- full mode에서 unchanged section을 펼칠 수 있다.
- side-by-side에서 delete/add가 적절한 열에 배치된다.
- binary 파일에서 text decoder 오류가 발생하지 않는다.
- 큰 파일이 Extension Host 메모리를 과도하게 사용하지 않는다.

---

## 19. Webview UI 설계

### 19.1 전역 화면 상태

```ts
export type AppRoute =
  | { name: 'fileHistory'; uri: string }
  | { name: 'commitLog'; repositoryId?: string };

export interface AppState {
  route: AppRoute;
  repositories: RepositoryInfo[];
  selectedRepositoryId?: string;
  loadingCount: number;
  lastError?: UiError;
}
```

### 19.2 File History 레이아웃

```text
┌────────────────────────────────────────────────────────────┐
│ File History  src/example.ts                   [Refresh]   │
├────────────────────────┬───────────────────────────────────┤
│ Commit list            │ Diff toolbar                      │
│                        │ [Changes/Full] [Unified/Side]      │
│ Author                 ├───────────────────────────────────┤
│ Date                   │ Diff viewer                       │
│ Subject                │                                   │
│ Hash                   │                                   │
└────────────────────────┴───────────────────────────────────┘
```

권장 비율:

```text
왼쪽 32%
오른쪽 68%
```

사용자가 splitter를 움직이면 Webview state에 저장한다.

### 19.3 Git Log 레이아웃

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Repository selector | Git Log | Refresh                            │
├───────────────┬────────────────────────────────┬────────────────────┤
│ Branch tree   │ Search toolbar                 │ Commit detail      │
│               ├────────────────────────────────┤                    │
│ Local         │ Commit rows                    │ Changed files      │
│ Remote        │                                │                    │
│               │                                │ File diff          │
└───────────────┴────────────────────────────────┴────────────────────┘
```

권장 초기 비율:

```text
Branches: 20%
Commit list: 45%
Detail: 35%
```

### 19.4 VS Code 테마 연동

CSS에 고정 색상을 최대한 쓰지 않고 다음 변수를 사용한다.

```css
color: var(--vscode-foreground);
background: var(--vscode-editor-background);
border-color: var(--vscode-panel-border);

.selected {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.added {
  background: var(--vscode-diffEditor-insertedTextBackground);
}

.deleted {
  background: var(--vscode-diffEditor-removedTextBackground);
}
```

### 19.5 접근성

- 모든 list row를 키보드로 선택 가능하게 한다.
- `role="listbox"`, `role="option"` 등 적절한 role을 사용한다.
- Enter: 선택 또는 열기
- Space: 선택
- Arrow Up/Down: 이동
- Double click 외에 Enter로 diff 열기 지원
- icon-only button에 `aria-label` 추가
- focus ring을 제거하지 않는다.

---

## 20. Webview HTML 및 보안

### 20.1 CSP

```html
<meta
  http-equiv="Content-Security-Policy"
  content="
    default-src 'none';
    style-src ${webview.cspSource};
    font-src ${webview.cspSource};
    img-src ${webview.cspSource} data:;
    script-src 'nonce-${nonce}';
  "
/>
```

### 20.2 필수 규칙

- `localResourceRoots`는 extension media 디렉터리만 허용한다.
- commit message/path/author를 HTML 문자열로 삽입하지 않는다.
- React 기본 escaping을 사용한다.
- `dangerouslySetInnerHTML`을 사용하지 않는다.
- patch line도 text node로 렌더링한다.
- Webview가 보낸 path를 그대로 shell에 넣지 않는다.
- Git은 `shell: false`로 실행한다.
- `--no-ext-diff`, `--no-textconv`를 사용한다.
- untrusted workspace에서는 기능을 비활성화한다.

---

## 21. 캐시 및 취소 설계

### 21.1 캐시 key 예시

```text
refs:{repositoryId}
fileHistory:{repositoryId}:{relativePath}:{cursor}:{limit}
commitLog:{repositoryId}:{filterHash}:{cursor}:{limit}
commitDetail:{repositoryId}:{commitHash}:{parentIndex}
diff:{repositoryId}:{commitHash}:{parentIndex}:{oldPath}:{newPath}
```

### 21.2 권장 cache 정책

| 데이터 | 정책 |
|---|---|
| branch refs | repository change 전까지 또는 짧은 TTL |
| commit log page | 동일 query 재진입 시 재사용 |
| commit detail | hash 기준 재사용 가능 |
| containing branches | refs 변경 시 무효화 |
| diff patch | commit hash 기준 재사용 가능 |
| full text | LRU 제한 필요 |

### 21.3 무효화 이벤트

- repository state change
- checkout
- commit
- refs change
- repository open/close
- 사용자 refresh

### 21.4 Cancellation 그룹

```text
fileHistory
commitLog
commitDetail
diff
refs
```

동일 그룹에 새 요청이 오면 기존 `CancellationTokenSource`를 dispose한다.

---

## 22. 오류 처리

### 22.1 표준 오류 코드

```ts
export type GitWorkbenchErrorCode =
  | 'GIT_NOT_FOUND'
  | 'REPOSITORY_NOT_FOUND'
  | 'FILE_OUTSIDE_REPOSITORY'
  | 'INVALID_REVISION'
  | 'OBJECT_NOT_FOUND'
  | 'BINARY_FILE'
  | 'FILE_TOO_LARGE'
  | 'REQUEST_CANCELLED'
  | 'GIT_COMMAND_FAILED'
  | 'PARSER_FAILED'
  | 'UNSUPPORTED_WORKSPACE'
  | 'UNKNOWN';
```

### 22.2 UI 메시지 예시

| 상황 | 사용자 메시지 |
|---|---|
| Git 미설치 | Git executable을 찾을 수 없습니다. VS Code Git 설정을 확인하세요. |
| repository 외 파일 | 선택한 파일은 Git 저장소에 포함되어 있지 않습니다. |
| 아직 commit되지 않은 파일 | 이 파일에 대한 commit 이력이 없습니다. |
| binary | Binary file은 텍스트 diff를 표시할 수 없습니다. |
| 대형 파일 | 파일 크기가 전체 보기 제한을 초과했습니다. 변경 구간만 표시합니다. |
| 취소 | UI에 오류를 표시하지 않음 |
| object 누락 | 해당 commit object를 로컬 저장소에서 찾을 수 없습니다. |

### 22.3 Output Channel

`Git Workbench` OutputChannel을 만들고 다음을 기록한다.

- repository root
- command 종류
- 실행 시간
- exit code
- parser error 위치
- cache hit/miss

commit message 전체나 민감한 path 기록은 설정으로 제어한다.

---

## 23. 성능 기준

초기 권장값:

| 항목 | 값 |
|---|---|
| Commit page size | 200 |
| File history first page | 100 |
| Search debounce | 300ms |
| Full file 기본 제한 | 2MB |
| Full diff line 제한 | 50,000 lines |
| Commit detail | 선택 후 lazy load |
| Containing branches | 선택 후 lazy load |
| Diff | 파일 열기 시 lazy load |

필수 최적화:

- commit list virtualization
- file list virtualization
- request cancellation
- debounce
- lazy loading
- pagination
- result cache
- 큰 text의 LRU cache
- Webview에 Buffer를 직접 보내지 않고 string 또는 구조화된 diff만 전송

---

## 24. 단계별 구현 계획

---

### Milestone 0 — 프로젝트 골격

#### 목표

Extension Host와 React Webview가 각각 빌드되고, 하단 Panel에서 기본 화면이 표시된다.

#### 작업 체크리스트

- [ ] Yeoman으로 TypeScript Extension 생성
- [ ] React 및 esbuild 설정
- [ ] Extension 번들 entry 구성
- [ ] Webview 번들 entry 구성
- [ ] 하단 Panel View Container 등록
- [ ] `WebviewViewProvider` 등록
- [ ] CSP 적용
- [ ] VS Code theme variable 기반 기본 CSS 적용
- [ ] `acquireVsCodeApi()` wrapper 생성
- [ ] Extension ↔ Webview ping/pong 메시지 구현
- [ ] OutputChannel 생성

#### 산출물

- `dist/extension.js`
- `media/webview.js`
- 하단 Git Workbench Panel
- Hello 또는 repository 없음 상태 화면

#### 완료 조건

- `F5`로 Extension Development Host가 열린다.
- Panel에서 Webview가 정상 렌더링된다.
- Developer Tools에 CSP 오류가 없다.
- ping 요청에 pong 응답이 표시된다.

---

### Milestone 1 — Git 및 Repository 기반

#### 목표

내장 Git API를 통해 repository를 찾고, 안전하게 Git CLI 명령을 실행한다.

#### 작업 체크리스트

- [ ] `git.d.ts` 추가
- [ ] `vscode.git` extension dependency 설정
- [ ] `GitApiProvider` 구현
- [ ] `RepositoryResolver` 구현
- [ ] `GitProcessRunner` 구현
- [ ] CancellationToken 연결
- [ ] Git command 오류 표준화
- [ ] multi-root repository 목록 조회
- [ ] repository selector 기본 UI 추가
- [ ] repository change event 구독

#### 산출물

- repository list API
- 선택 repository state
- `git rev-parse --show-toplevel` 또는 내장 API 기반 검증

#### 완료 조건

- workspace의 repository 목록이 Panel에 표시된다.
- multi-root 환경에서 repository를 전환할 수 있다.
- repository 밖 URI에 명확한 오류가 표시된다.
- Git process 취소 테스트가 통과한다.

---

### Milestone 2 — 우클릭 File History 진입

#### 목표

에디터와 Explorer에서 선택한 파일로 File History 화면을 연다.

#### 작업 체크리스트

- [ ] `gitWorkbench.showFileHistory` command 등록
- [ ] editor context submenu 등록
- [ ] explorer context submenu 등록
- [ ] URI argument 우선 처리
- [ ] active editor fallback 처리
- [ ] untitled/non-file scheme 처리
- [ ] Panel focus command 실행
- [ ] Webview route를 `fileHistory`로 변경
- [ ] 파일명과 repository path를 헤더에 표시

#### 완료 조건

- 에디터 우클릭으로 올바른 파일이 열린다.
- Explorer 우클릭으로 올바른 파일이 열린다.
- 다른 파일에서 재실행하면 화면이 갱신된다.
- untitled 문서에서 안내 메시지가 표시된다.

---

### Milestone 3 — File History 데이터

#### 목표

`git log --follow` 결과를 안전하게 파싱해 파일 commit 목록을 반환한다.

#### 작업 체크리스트

- [ ] NUL-separated Git format 정의
- [ ] `FileHistoryService` 구현
- [ ] `fileHistoryParser` 구현
- [ ] author/date/subject/hash 파싱
- [ ] parent hashes 파싱
- [ ] decorations 파싱
- [ ] `--name-status -z` 파싱
- [ ] rename chain 추적
- [ ] root commit 처리
- [ ] history page limit 적용
- [ ] parser fixture 작성
- [ ] 특수문자 파일명 테스트

#### 완료 조건

- 일반 수정 이력이 최신순으로 표시된다.
- 공백, 한글, 탭, 개행과 유사한 특수문자가 있는 경로를 처리한다.
- rename 이전 commit이 이어진다.
- 빈 이력에서 empty state가 표시된다.
- parser unit test가 통과한다.

---

### Milestone 4 — File History UI

#### 목표

왼쪽 history 목록을 사용 가능하게 만들고 커밋 선택 상태를 관리한다.

#### 작업 체크리스트

- [ ] File History 2단 split layout
- [ ] virtualized commit list
- [ ] author/date/subject/hash row
- [ ] selected row style
- [ ] 키보드 이동
- [ ] loading skeleton
- [ ] error state
- [ ] empty state
- [ ] 첫 번째 commit 자동 선택 정책 결정
- [ ] scroll 위치 유지
- [ ] refresh 처리

#### 완료 조건

- 1,000개 이상의 이력에서도 목록 스크롤이 부드럽다.
- 선택된 commit이 명확히 표시된다.
- 키보드로 commit을 바꿀 수 있다.
- 파일을 재선택하면 이전 selection이 잘못 유지되지 않는다.

---

### Milestone 5 — Unified Diff MVP

#### 목표

File History의 선택된 commit에 대해 오른쪽에 unified diff를 표시한다.

#### 작업 체크리스트

- [ ] `DiffService.loadPatch` 구현
- [ ] parent index 기본값 0
- [ ] root commit 처리
- [ ] added/deleted/modified 처리
- [ ] rename old/new path 처리
- [ ] binary detection
- [ ] patch parser 구현
- [ ] line number 계산
- [ ] UnifiedDiff 컴포넌트 구현
- [ ] syntax text escaping 검증
- [ ] “No newline at end of file” 처리
- [ ] diff request cancellation

#### 완료 조건

- 커밋을 클릭하면 해당 파일 diff가 표시된다.
- 추가 파일은 빈 old와 비교된다.
- 삭제 파일은 빈 new와 비교된다.
- rename 파일은 old/new 경로가 표시된다.
- binary 파일은 안전한 안내 화면을 표시한다.
- 빠르게 여러 commit을 선택해도 마지막 선택 결과만 남는다.

> 이 시점이 첫 번째 내부 사용 가능한 MVP이다.

---

### Milestone 6 — Full File 및 Collapse Diff

#### 목표

변경 구간 보기와 전체 파일 보기, unchanged region 접기/펼치기를 지원한다.

#### 작업 체크리스트

- [ ] old/new text lazy load
- [ ] full text size 제한
- [ ] hunk와 full text segment 병합
- [ ] collapsed region 모델 구현
- [ ] 개별 펼치기
- [ ] 전체 펼치기/접기
- [ ] view mode toggle
- [ ] full mode loading 상태
- [ ] line virtualization 검토 및 적용
- [ ] side-by-side 모델 설계
- [ ] side-by-side UI 구현

#### 완료 조건

- Changes/Full 전환이 동작한다.
- Full 모드에서 변경되지 않은 구간이 기본 접힘 상태다.
- 접힌 구간을 개별적으로 펼칠 수 있다.
- Unified/Side-by-side 전환이 동작한다.
- 대형 파일에서 Full 모드가 제한되고 이유가 표시된다.

---

### Milestone 7 — Branch Tree와 Git Log

#### 목표

하단 Panel의 Git Log 화면에서 branch와 commit 목록을 조회한다.

#### 작업 체크리스트

- [ ] File History / Git Log 화면 전환
- [ ] `RefService` 또는 CommitLogService 내 ref 조회 구현
- [ ] local/remote 그룹화
- [ ] current branch 표시
- [ ] symbolic remote HEAD 필터링
- [ ] CommitLogService 구현
- [ ] commit log parser 구현
- [ ] topo-order 기반 목록
- [ ] commit list virtualization
- [ ] branch 선택 query
- [ ] all refs query
- [ ] pagination
- [ ] 다음 페이지 중복 제거

#### 완료 조건

- local/remote branch가 구분되어 표시된다.
- branch 선택 시 중앙 commit 목록이 갱신된다.
- All Branches 선택 시 전체 refs commit이 표시된다.
- 스크롤 하단에서 다음 page를 불러온다.
- 같은 commit이 중복 표시되지 않는다.

---

### Milestone 8 — Commit 검색

#### 목표

branch, author, date, message 검색을 조합할 수 있다.

#### 작업 체크리스트

- [ ] 검색 toolbar UI
- [ ] branch selector와 branch tree 상태 통합
- [ ] author input
- [ ] since date input
- [ ] until date input
- [ ] message input
- [ ] 300ms debounce
- [ ] invalid date validation
- [ ] 검색 초기화 버튼
- [ ] 이전 요청 취소
- [ ] filter hash cache key
- [ ] 결과 count 또는 loaded count 표시

#### 완료 조건

- 각 필터가 독립적으로 동작한다.
- 복수 필터 조합이 동작한다.
- 검색 중 빠르게 입력해도 오래된 결과가 덮어쓰지 않는다.
- 초기화하면 기본 commit 목록으로 돌아간다.

---

### Milestone 9 — Commit Detail과 변경 파일

#### 목표

커밋 선택 시 상세 metadata, 포함 branch, 변경 파일 목록을 표시한다.

#### 작업 체크리스트

- [ ] CommitDetailService 구현
- [ ] metadata query
- [ ] containing branches query
- [ ] changed files query
- [ ] root commit changed files 처리
- [ ] merge parent selector
- [ ] commit subject/body UI
- [ ] author/date/hash UI
- [ ] containing branch chips/list
- [ ] changed file 상태 icon
- [ ] rename path UI
- [ ] 변경 파일 keyboard/double-click interaction

#### 완료 조건

- commit 클릭 시 상세가 표시된다.
- 포함 branch가 local/remote로 구분된다.
- 변경 파일 상태가 정확하다.
- merge parent 전환 시 변경 파일 목록이 갱신된다.
- root commit 상세가 오류 없이 표시된다.

---

### Milestone 10 — Git Log 파일 Diff

#### 목표

commit detail의 변경 파일을 열어 해당 commit diff를 본다.

#### 작업 체크리스트

- [ ] changed file double-click 처리
- [ ] commit detail → file diff route
- [ ] back navigation
- [ ] 기존 DiffService 재사용
- [ ] selected parent 전달
- [ ] old/new path 전달
- [ ] detail selection 유지
- [ ] diff loading/error 처리
- [ ] next/previous changed file navigation 선택 구현

#### 완료 조건

- 파일 더블클릭 시 올바른 diff가 표시된다.
- 뒤로 가면 이전 commit 상세와 scroll 위치가 유지된다.
- merge parent 선택이 diff에 반영된다.
- rename, delete, add 파일이 모두 정상 표시된다.

---

### Milestone 11 — Commit Graph

#### 목표

중앙 commit 목록에 최소한의 graph lane을 표시한다.

#### 작업 체크리스트

- [ ] parent hash 기반 graph model 정의
- [ ] active lane 관리 알고리즘 구현
- [ ] normal commit
- [ ] branch split
- [ ] two-parent merge
- [ ] lane termination
- [ ] off-page parent 처리
- [ ] SVG 또는 Canvas 렌더링 선택
- [ ] row height와 graph 정렬
- [ ] graph disabled 설정 검토

#### 완료 조건

- 일반 branch와 merge history가 시각적으로 연결된다.
- pagination 경계에서 graph가 심하게 끊기지 않는다.
- graph 때문에 list virtualization이 깨지지 않는다.

> 이 단계는 기능 완성 후 진행한다. 검색·상세·diff보다 우선하지 않는다.

---

### Milestone 12 — 안정화, 테스트, 패키징

#### 목표

실제 repository에서 반복 사용 가능한 품질로 정리한다.

#### 작업 체크리스트

- [ ] parser unit test 확대
- [ ] service unit test
- [ ] integration repository fixture 생성
- [ ] VS Code Extension test
- [ ] Windows/macOS/Linux 경로 검증
- [ ] Remote SSH/WSL/Dev Container 확인
- [ ] large repository smoke test
- [ ] memory usage 확인
- [ ] cache invalidation 검증
- [ ] workspace trust 검증
- [ ] keyboard accessibility 점검
- [ ] dark/light/high contrast theme 확인
- [ ] README 작성
- [ ] CHANGELOG 작성
- [ ] icon/license 작성
- [ ] VSIX package 생성

#### 완료 조건

- 핵심 parser test가 모두 통과한다.
- 실제 대형 repository에서 기본 탐색이 가능하다.
- repository 변경 후 refresh 또는 자동 갱신이 동작한다.
- Webview CSP 및 console error가 없다.
- VSIX를 설치한 새 VS Code 프로필에서 동작한다.

---

## 25. 권장 이슈 분할

GitHub Issues 또는 작업 티켓을 아래 단위로 만든다.

### Foundation

- [ ] FND-001 Extension/Webview esbuild 구성
- [ ] FND-002 Bottom Panel Webview View 등록
- [ ] FND-003 Shared message protocol 구축
- [ ] FND-004 Built-in Git API 연결
- [ ] FND-005 GitProcessRunner 구현
- [ ] FND-006 RepositoryResolver 구현

### File History

- [ ] FH-001 editor/explorer context menu
- [ ] FH-002 file history Git query
- [ ] FH-003 file history parser
- [ ] FH-004 rename chain 처리
- [ ] FH-005 File History list UI
- [ ] FH-006 commit selection/cancellation
- [ ] FH-007 root/merge commit 처리

### Diff

- [ ] DF-001 patch query
- [ ] DF-002 unified patch parser
- [ ] DF-003 UnifiedDiff UI
- [ ] DF-004 added/deleted/renamed/binary 처리
- [ ] DF-005 full-file text loading
- [ ] DF-006 unchanged collapse
- [ ] DF-007 side-by-side view
- [ ] DF-008 large-file guard

### Git Log

- [ ] GL-001 branch ref query/parser
- [ ] GL-002 BranchTree UI
- [ ] GL-003 commit log query/parser
- [ ] GL-004 virtualized CommitList
- [ ] GL-005 pagination
- [ ] GL-006 author/date/message filters
- [ ] GL-007 search cancellation/cache
- [ ] GL-008 basic commit graph

### Commit Detail

- [ ] CD-001 commit metadata
- [ ] CD-002 containing branches
- [ ] CD-003 changed files
- [ ] CD-004 merge parent selector
- [ ] CD-005 changed file double-click diff
- [ ] CD-006 detail/diff navigation state

### Quality

- [ ] QA-001 parser fixtures
- [ ] QA-002 generated repository integration tests
- [ ] QA-003 multi-root tests
- [ ] QA-004 binary/large file tests
- [ ] QA-005 accessibility and keyboard tests
- [ ] QA-006 remote workspace smoke tests
- [ ] QA-007 VSIX release checklist

---

## 26. 테스트 전략

### 26.1 Parser unit test fixture

다음 Git 출력 fixture를 저장한다.

- 일반 commit
- multi-line commit body
- 한글 author
- 한글 경로
- 공백이 있는 경로
- rename `R100`
- copy `C087`
- root commit
- merge commit
- binary patch
- deleted file
- no newline marker

### 26.2 자동 생성 integration repository

테스트 전에 임시 directory에서 다음 이력을 생성한다.

```text
1. init
2. src/a.ts 추가
3. src/a.ts 수정
4. src/a.ts → src/b.ts rename
5. feature branch 생성
6. feature에서 src/b.ts 수정
7. main에서 다른 파일 수정
8. merge commit 생성
9. binary 파일 추가 및 수정
10. 한글과 공백이 포함된 파일 추가
11. 파일 삭제
12. remote ref 모사
```

테스트할 내용:

- File History entry 수와 순서
- rename 이전 path 연결
- branch별 commit 결과
- author/message/date filter
- merge parent별 changed file 차이
- root commit diff
- binary detection

### 26.3 Extension integration test

- command가 등록되어 있는지
- Webview View가 resolve되는지
- editor context command가 active URI를 사용하는지
- Explorer URI argument가 우선하는지
- repository 변경 event가 refresh를 유발하는지

### 26.4 수동 테스트 매트릭스

| 환경 | 확인 항목 |
|---|---|
| Windows | drive letter, backslash, Unicode path |
| macOS | case-sensitive/case-insensitive path |
| Linux | symbolic link, Unicode path |
| WSL | workspace extension host 위치 |
| Remote SSH | 원격 Git executable 사용 |
| Dev Container | container 내부 Git 사용 |
| Multi-root | 올바른 repository 선택 |
| Detached HEAD | branch 없는 HEAD 표시 |
| Shallow clone | 누락된 과거 object 안내 |
| Large repo | pagination, cancellation, memory |

---

## 27. 구현 시 주의해야 할 Git 예외

### 27.1 Merge commit

merge commit의 diff는 parent에 따라 다르다. 항상 first parent만 고정하면 사용자가 기대하는 변경과 다를 수 있으므로 selector를 둔다.

### 27.2 Root commit

parent가 없기 때문에 일반 `parent..commit` 명령을 사용할 수 없다. 빈 tree 비교 또는 `diff-tree --root` 분기가 필요하다.

### 27.3 Rename

현재 path만 저장하면 과거 commit의 blob을 찾지 못한다. history entry와 changed file에 old/new path를 모두 보존한다.

### 27.4 Binary

UTF-8 decoder로 무조건 변환하지 않는다. patch header와 object type/size를 먼저 확인한다.

### 27.5 Submodule

submodule 변경은 source text가 아니라 commit pointer 변경으로 표시한다.

### 27.6 Symlink

blob 내용은 symlink target 문자열일 수 있다. file mode를 함께 표시하는 후속 개선을 고려한다.

### 27.7 Shallow clone

과거 parent object가 없을 수 있다. “로컬 저장소에 해당 object가 없음”으로 구분한다.

### 27.8 Uncommitted working tree

본 계획의 File History는 commit history만 표시한다. working tree 변경과 index 변경은 별도 virtual entry로 추가할 수 있으나 MVP에서는 제외한다.

---

## 28. Definition of Done

### File History

- [ ] editor와 Explorer에서 진입 가능
- [ ] 올바른 repository와 relative path 사용
- [ ] author/date/subject/hash 표시
- [ ] rename 이력 추적
- [ ] commit 선택 시 diff 표시
- [ ] root/merge/add/delete/rename/binary 처리
- [ ] changes/full 전환
- [ ] unchanged region collapse
- [ ] unified/side-by-side 전환
- [ ] request cancellation
- [ ] loading/error/empty 상태

### Git Log

- [ ] local/remote branch 목록
- [ ] 현재 branch 표시
- [ ] 전체 commit history
- [ ] branch/author/date/message 검색
- [ ] pagination
- [ ] commit 선택 상세
- [ ] 포함 branch
- [ ] changed files
- [ ] merge parent selector
- [ ] 파일 더블클릭 diff
- [ ] 상세로 돌아가기

### 품질

- [ ] parser fixture test
- [ ] generated repository integration test
- [ ] multi-root 동작
- [ ] remote workspace smoke test
- [ ] CSP 적용
- [ ] workspace trust 적용
- [ ] 대형 파일 제한
- [ ] list virtualization
- [ ] cache invalidation
- [ ] VSIX 설치 테스트

---

## 29. 첫 구현 세션에서 만들 파일 순서

가장 빠르게 vertical slice를 완성하려면 아래 순서로 파일을 만든다.

```text
1. esbuild.mjs
2. src/shared/protocol.ts
3. src/shared/models.ts
4. src/panel/getWebviewHtml.ts
5. src/panel/GitWorkbenchViewProvider.ts
6. webview/index.tsx
7. webview/App.tsx
8. src/git/GitApiProvider.ts
9. src/git/RepositoryResolver.ts
10. src/git/GitProcessRunner.ts
11. src/commands/registerCommands.ts
12. src/git/FileHistoryService.ts
13. src/git/parsers/fileHistoryParser.ts
14. webview/features/fileHistory/FileHistoryPage.tsx
15. webview/features/fileHistory/FileHistoryList.tsx
16. src/git/DiffService.ts
17. src/git/parsers/patchParser.ts
18. webview/features/diff/UnifiedDiff.tsx
```

이 순서의 목표는 다음 흐름을 최대한 빨리 완성하는 것이다.

```text
우클릭 → File History 목록 → commit 선택 → unified diff
```

그 이후에 Git Log 기능을 추가한다.

---

## 30. 첫 번째 PR 범위

첫 번째 PR은 아래에만 집중한다.

### 포함

- 프로젝트 빌드
- 하단 Panel
- Webview message 통신
- 내장 Git API 연결
- GitProcessRunner
- RepositoryResolver
- editor/explorer File History command
- file history 목록
- unified patch diff
- 기본 오류 처리
- 핵심 parser test

### 제외

- full-file diff
- side-by-side diff
- branch tree
- commit log
- commit detail
- commit graph

### 첫 번째 PR 완료 시 데모

```text
1. VS Code에서 Git repository 열기
2. 수정 이력이 있는 파일 열기
3. 우클릭 → Git Workbench → Show File History
4. 하단 Panel에서 commit 목록 확인
5. commit 클릭
6. 오른쪽에서 unified diff 확인
```

---

## 31. 개발 중 의사결정 기록 항목

`docs/adr/` 아래에 Architecture Decision Record를 남기는 것을 권장한다.

예시:

```text
ADR-001 Webview View를 TreeView 대신 사용한 이유
ADR-002 Built-in Git API와 Git CLI를 혼합한 이유
ADR-003 NUL-separated Git output 사용
ADR-004 Diff renderer 자체 구현 범위
ADR-005 Commit pagination 전략
ADR-006 Commit graph renderer 선택
```

각 ADR은 다음 형식을 사용한다.

```md
# ADR-XXX 제목

## 상태
Accepted

## 배경

## 결정

## 대안

## 결과
```

---

## 32. 최종 구현 순서 요약

```text
프로젝트 골격
→ Panel + React Webview
→ Git API + RepositoryResolver
→ GitProcessRunner
→ 우클릭 File History 진입
→ git log --follow parser
→ File History list
→ unified diff
→ full/collapsible/side-by-side diff
→ branch tree
→ commit log + 검색 + pagination
→ commit detail + containing branches + changed files
→ changed file double-click diff
→ commit graph
→ 성능·테스트·패키징
```

가장 중요한 기준은 두 기능을 동시에 넓게 구현하는 것이 아니라, 먼저 아래 수직 흐름을 완성하는 것이다.

```text
파일 선택
→ 저장소 탐색
→ Git 조회
→ parser
→ Webview 전달
→ 목록 선택
→ diff 조회
→ diff 렌더링
```

이 흐름에서 만들어진 `RepositoryResolver`, `GitProcessRunner`, parser, message protocol, cancellation, cache를 Git Log 기능에서 그대로 재사용한다.

---

## 33. 구현 시작 체크리스트

```text
[ ] Node.js 및 npm 확인
[ ] Git CLI 확인
[ ] VS Code Extension Generator로 프로젝트 생성
[ ] React/esbuild 설정
[ ] F5 실행 성공
[ ] Bottom Panel 표시
[ ] Webview CSP 적용
[ ] built-in Git API 연결
[ ] repository root 표시
[ ] 우클릭 command 동작
[ ] File History Git query 출력 확인
[ ] parser fixture 고정
[ ] File History 목록 렌더링
[ ] commit 선택 request 구현
[ ] Unified diff 렌더링
[ ] 첫 번째 PR 생성
```

