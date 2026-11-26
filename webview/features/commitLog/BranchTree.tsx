import { useMemo, useState } from 'react';
import type { BranchRef } from '../../../src/shared/models';

interface BranchTreeProps {
  refs: readonly BranchRef[];
  selectedRef?: string;
  allRefs: boolean;
  onSelectAll: () => void;
  onSelectRef: (ref: BranchRef) => void;
}

export function BranchTree({
  refs,
  selectedRef,
  allRefs,
  onSelectAll,
  onSelectRef,
}: BranchTreeProps): JSX.Element {
  const [filter, setFilter] = useState('');

  const groups = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    // symbolic origin/HEAD는 기본 화면에서 숨긴다.
    const visible = refs.filter(
      ref =>
        !ref.isSymbolic &&
        (keyword === '' || ref.shortName.toLowerCase().includes(keyword)),
    );

    return {
      local: visible.filter(ref => ref.kind === 'local'),
      remote: visible.filter(ref => ref.kind === 'remote'),
      tag: visible.filter(ref => ref.kind === 'tag'),
    };
  }, [refs, filter]);

  return (
    <div className="branch-tree">
      <div className="branch-tree-header">
        <input
          className="branch-filter"
          type="search"
          value={filter}
          placeholder="브랜치 필터"
          aria-label="브랜치 필터"
          onChange={event => setFilter(event.currentTarget.value)}
        />
      </div>

      <div className="branch-scroll" role="tree" aria-label="브랜치 목록">
        <button
          type="button"
          className={allRefs ? 'branch-item selected' : 'branch-item'}
          aria-selected={allRefs}
          role="treeitem"
          onClick={onSelectAll}
        >
          모든 브랜치
        </button>

        <BranchGroup
          label="Local"
          refs={groups.local}
          selectedRef={allRefs ? undefined : selectedRef}
          onSelectRef={onSelectRef}
        />
        <BranchGroup
          label="Remote"
          refs={groups.remote}
          selectedRef={allRefs ? undefined : selectedRef}
          onSelectRef={onSelectRef}
        />
        <BranchGroup
          label="Tags"
          refs={groups.tag}
          selectedRef={allRefs ? undefined : selectedRef}
          onSelectRef={onSelectRef}
        />
      </div>
    </div>
  );
}

function BranchGroup({
  label,
  refs,
  selectedRef,
  onSelectRef,
}: {
  label: string;
  refs: readonly BranchRef[];
  selectedRef?: string;
  onSelectRef: (ref: BranchRef) => void;
}): JSX.Element | null {
  const [open, setOpen] = useState(true);

  if (refs.length === 0) {
    return null;
  }

  return (
    <div className="branch-group">
      <button
        type="button"
        className="branch-group-header"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        <span className="chevron">{open ? '▾' : '▸'}</span>
        {label}
        <span className="branch-count">{refs.length}</span>
      </button>

      {open
        ? refs.map(ref => (
            <button
              key={ref.fullName}
              type="button"
              role="treeitem"
              aria-selected={selectedRef === ref.shortName}
              className={
                selectedRef === ref.shortName
                  ? 'branch-item selected'
                  : 'branch-item'
              }
              title={ref.fullName}
              onClick={() => onSelectRef(ref)}
            >
              {ref.isCurrent ? <span className="current-marker">●</span> : null}
              <span className="branch-name">{ref.shortName}</span>
              {ref.upstream ? (
                <span className="branch-upstream">{ref.upstream}</span>
              ) : null}
            </button>
          ))
        : null}
    </div>
  );
}
