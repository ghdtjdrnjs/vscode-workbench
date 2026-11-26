# Changelog

## 0.0.1

첫 버전. 조회 전용.

### File History

- editor / Explorer 우클릭 → Git Workbench → Show File History
- `git log --follow` 기반 이력, rename 이전 경로 추적
- 작성자 / 날짜 / 커밋 메시지 / 짧은 hash 표시, 키보드 이동, 가상 목록
- unified diff, side-by-side diff
- 변경 구간 / 전체 파일 전환, 변경되지 않은 구간 접기·펼치기
- 추가 / 수정 / 삭제 / rename / binary / root commit 처리
- merge commit parent 선택

### Git Log

- 상태 표시줄 진입 버튼, 하단 패널 탭, 명령 팔레트 세 가지 진입점
- local / remote / tag 브랜치 목록, 현재 브랜치 표시, symbolic ref 숨김
- 전체 refs 또는 단일 브랜치 기준 커밋 목록, 최소 commit graph
- 브랜치 / 작성자 / 날짜 범위 / 메시지 검색, 300ms debounce, 이전 요청 취소
- pagination, 중복 커밋 제거 (Git Log는 `--skip`, File History는 `--follow` 제약 때문에 hash cursor)
- 커밋 상세: 본문, 작성자, 날짜, full hash, 포함 브랜치, 변경 파일
- 변경 파일 더블클릭 / Enter → VS Code 기본 diff 편집기에서 열기
- File History diff 툴바에 `편집기에서 열기` 추가
- `git-workbench:` 읽기 전용 스킴으로 과거 파일 내용 제공 (구문 강조 유지)
- 커밋 메시지 칸에서 commit hash 검색 (전체·짧은 hash, 대소문자 무관)
- 브랜치 목록 접기/펼치기 (기본 접힘, 상태 유지)
- 커밋 상세를 메시지 영역과 변경 파일 목록으로 위아래 분할, 크기 조절 가능
- 분할 영역 크기를 컨텐츠와 분리. 최소 크기를 80px로 통일해 어떤 내용이 로드돼도 한계가 같다
- divider가 왼쪽으로 튀고 오른쪽으로 가지 않던 문제 수정 (flex shrink + min-content 누수)
- divider를 이동량 기반 드래그로 교체. 잡는 순간 순간이동하지 않는다
- divider 잡는 폭을 9px로 넓힘 (보이는 선 굵기는 유지), pointer capture 적용
- 크기 한계를 JS 측정이 아닌 CSS min/max로 강제. 리레이아웃마다 저장된 비율이 밀려 한쪽 끝에 고정되던 문제 수정
- webview state에 버전을 붙여 이전에 잘못 저장된 크기를 한 번 버린다
- VS Code 없이 webview를 확인하는 브라우저 하네스 추가 (`npm run harness`)

### Cherry-Pick

- 커밋 우클릭 → Cherry-Pick, 실행 전 확인 대화상자
- dirty working tree·진행 중인 cherry-pick 사전 차단
- 충돌은 오류가 아닌 안내로 처리하고 해결 방법 제시
- 이미 반영된 커밋은 빈 커밋을 만들지 않음

### 기반

- `spawn(shell: false)` 기반 Git 실행, CancellationToken 연결, stdout 크기 제한
- 요청 그룹 단위 취소, LRU 캐시, repository·설정 변경 이벤트 기반 무효화
- webview 준비 전 알림 큐잉 (ping/pong 핸드셰이크)
- NUL/US 구분 git 출력 파서 (commit record, name-status, ref, patch)
- commit hash / 상대 경로 / ref 이름 검증, `-`로 시작하는 ref 거부
- CSP 적용 Webview, 신뢰되지 않은 workspace에서 비활성화
- 활성화가 실패해도 패널을 빈 화면으로 두지 않고 이유를 표시한다
- git 실행 파일 경로를 명령 실행 시점에 해석해 시작 시점 경쟁을 제거
- 실제 git 출력 fixture 기반 파서 테스트 + 임시 저장소 기반 서비스 테스트 77건 + jsdom webview 렌더링 테스트 12건
- 저장소 변경 알림 디바운스 + 실제 변경 감지, webview 재렌더 churn 제거 (jsdom 렌더링 테스트로 고정)
- 갱신 중 화면 전체 교체 제거. 일시적 실패·빈 저장소 목록은 탭 바 표시로만 알린다
- 검색어 입력 중 간헐적으로 화면 전체가 사라지던 문제 수정 (setState updater 안에서 `event.currentTarget`을 읽던 버그)
- 렌더 오류가 나도 빈 화면으로 남지 않는다. Error Boundary가 탭 바는 남기고 `다시 시도` / `화면 새로고침` 버튼을 보여 준다
- 패널 제목 표시줄에 `Reload View` 추가. webview HTML을 다시 넣어 화면이 죽은 상태에서도 창 재로드 없이 복구한다
- webview 오류(렌더·이벤트·비동기)를 출력 → Git Workbench 채널에 `[webview]`로 기록한다
- ResizeObserver 재진입 방지 + 스크롤바 폭 고정
- 실제 Git 저장소를 연 VS Code Extension Host 통합 테스트 11건
