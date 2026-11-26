import { useEffect, useState } from 'react';
import { SEARCH_DEBOUNCE_MS } from '../../../src/shared/constants';
import type { CommitFilters } from '../../../src/shared/protocol';

interface CommitSearchBarProps {
  filters: CommitFilters;
  loadedCount: number;
  hasMore: boolean;
  onChange: (filters: CommitFilters) => void;
}

interface DraftFilters {
  author: string;
  since: string;
  until: string;
  message: string;
}

export function CommitSearchBar({
  filters,
  loadedCount,
  hasMore,
  onChange,
}: CommitSearchBarProps): JSX.Element {
  const [draft, setDraft] = useState<DraftFilters>({
    author: filters.author ?? '',
    since: filters.since ?? '',
    until: filters.until ?? '',
    message: filters.message ?? '',
  });
  const [dateError, setDateError] = useState<string | undefined>();

  // branch 선택 등 외부에서 필터가 바뀌면 입력값을 맞춘다.
  useEffect(() => {
    setDraft({
      author: filters.author ?? '',
      since: filters.since ?? '',
      until: filters.until ?? '',
      message: filters.message ?? '',
    });
  }, [filters.author, filters.since, filters.until, filters.message]);

  useEffect(() => {
    const invalid = validateRange(draft.since, draft.until);
    setDateError(invalid);

    if (invalid) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const next: CommitFilters = {
        ...filters,
        author: draft.author.trim() || undefined,
        since: draft.since || undefined,
        until: draft.until || undefined,
        message: draft.message.trim() || undefined,
      };

      if (!sameFilters(next, filters)) {
        onChange(next);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
    // filters/onChange는 매 렌더 새로 생기지 않도록 상위에서 관리한다.
  }, [draft, filters, onChange]);

  // event 값은 여기서 먼저 꺼낸다. updater 안에서 event를 읽으면
  // 렌더 시점으로 미뤄졌을 때 currentTarget이 이미 null이라 화면 전체가 죽는다.
  const updateDraft = (key: keyof DraftFilters, value: string): void => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  const reset = (): void => {
    setDraft({ author: '', since: '', until: '', message: '' });
    onChange({ ref: filters.ref, allRefs: filters.allRefs });
  };

  return (
    <div className="search-bar">
      <input
        type="search"
        value={draft.message}
        placeholder="커밋 메시지 또는 hash"
        aria-label="커밋 메시지 또는 hash 검색"
        onChange={event => updateDraft('message', event.currentTarget.value)}
      />
      <input
        type="search"
        value={draft.author}
        placeholder="작성자"
        aria-label="작성자 검색"
        onChange={event => updateDraft('author', event.currentTarget.value)}
      />
      <input
        type="date"
        value={draft.since}
        aria-label="시작 날짜"
        title="시작 날짜"
        onChange={event => updateDraft('since', event.currentTarget.value)}
      />
      <span className="date-separator">~</span>
      <input
        type="date"
        value={draft.until}
        aria-label="종료 날짜"
        title="종료 날짜"
        onChange={event => updateDraft('until', event.currentTarget.value)}
      />
      <button type="button" onClick={reset}>
        초기화
      </button>
      <div className="toolbar-spacer" />
      {dateError ? (
        <span className="search-error" role="alert">
          {dateError}
        </span>
      ) : (
        <span className="search-count">
          {loadedCount}건{hasMore ? '+' : ''}
        </span>
      )}
    </div>
  );
}

function validateRange(since: string, until: string): string | undefined {
  if (since && Number.isNaN(Date.parse(since))) {
    return '시작 날짜가 올바르지 않습니다.';
  }

  if (until && Number.isNaN(Date.parse(until))) {
    return '종료 날짜가 올바르지 않습니다.';
  }

  if (since && until && Date.parse(since) > Date.parse(until)) {
    return '시작 날짜가 종료 날짜보다 늦습니다.';
  }

  return undefined;
}

function sameFilters(a: CommitFilters, b: CommitFilters): boolean {
  return (
    a.ref === b.ref &&
    a.allRefs === b.allRefs &&
    a.author === b.author &&
    a.since === b.since &&
    a.until === b.until &&
    a.message === b.message
  );
}
