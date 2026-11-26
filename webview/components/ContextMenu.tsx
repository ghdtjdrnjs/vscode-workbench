import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: readonly ContextMenuItem[];
  onClose: () => void;
}

/**
 * webview 안에서 쓰는 최소 컨텍스트 메뉴.
 * VS Code의 네이티브 메뉴는 webview 내부 요소에 붙일 수 없어서 직접 그린다.
 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onClose);

    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  // 첫 항목으로 포커스를 옮겨 키보드로도 쓸 수 있게 한다.
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
  }, []);

  // 화면 밖으로 넘치지 않게 위치를 보정한다.
  const left = Math.min(x, window.innerWidth - 180);
  const top = Math.min(y, window.innerHeight - items.length * 26 - 12);

  return (
    <div
      className="context-menu"
      ref={ref}
      role="menu"
      style={{ left: Math.max(0, left), top: Math.max(0, top) }}
    >
      {items.map(item => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={item.danger ? 'context-menu-item danger' : 'context-menu-item'}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
