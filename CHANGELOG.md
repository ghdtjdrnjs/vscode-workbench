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

- local / remote / tag 브랜치 목록, 현재 브랜치 표시, symbolic ref 숨김
- 전체 refs 또는 단일 브랜치 기준 커밋 목록, 최소 commit graph
- 브랜치 / 작성자 / 날짜 범위 / 메시지 검색, 300ms debounce, 이전 요청 취소
- pagination, 중복 커밋 제거 (Git Log는 `--skip`, File History는 `--follow` 제약 때문에 hash cursor)
- 커밋 상세: 본문, 작성자, 날짜, full hash, 포함 브랜치, 변경 파일
- 변경 파일 더블클릭 / Enter → 파일 diff, 뒤로 가기

### 기반

- `spawn(shell: false)` 기반 Git 실행, CancellationToken 연결, stdout 크기 제한
- 요청 그룹 단위 취소, LRU 캐시, repository·설정 변경 이벤트 기반 무효화
- webview 준비 전 알림 큐잉 (ping/pong 핸드셰이크)
- NUL/US 구분 git 출력 파서 (commit record, name-status, ref, patch)
- commit hash / 상대 경로 / ref 이름 검증, `-`로 시작하는 ref 거부
- CSP 적용 Webview, 신뢰되지 않은 workspace에서 비활성화
- 실제 git 출력 fixture 기반 파서 테스트 + 임시 저장소 기반 서비스 테스트 66건
- 실제 Git 저장소를 연 VS Code Extension Host 통합 테스트 9건
