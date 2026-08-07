interface ParentSelectorProps {
  parentHashes: readonly string[];
  parentIndex: number;
  onChange: (index: number) => void;
}

/** merge commit에서 어떤 parent와 비교할지 고른다. */
export function ParentSelector({
  parentHashes,
  parentIndex,
  onChange,
}: ParentSelectorProps): JSX.Element | null {
  if (parentHashes.length <= 1) {
    return null;
  }

  return (
    <div className="parent-selector">
      <label htmlFor="parent-select">비교 대상</label>
      <select
        id="parent-select"
        value={parentIndex}
        onChange={event => onChange(Number(event.currentTarget.value))}
      >
        {parentHashes.map((hash, index) => (
          <option key={hash} value={index}>
            Parent {index + 1}: {hash.slice(0, 7)}
          </option>
        ))}
      </select>
    </div>
  );
}
