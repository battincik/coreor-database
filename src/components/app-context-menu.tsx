'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface AppContextMenuItem {
  id: string;
  label?: string;
  icon?: LucideIcon;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  children?: AppContextMenuItem[];
  onSelect?: () => void | Promise<void>;
}

interface MenuState {
  x: number;
  y: number;
  title?: string;
  items: AppContextMenuItem[];
}

interface AppContextMenuContextValue {
  openContextMenu: (event: React.MouseEvent | MouseEvent, items: AppContextMenuItem[], title?: string) => void;
  closeContextMenu: () => void;
}

const AppContextMenuContext = createContext<AppContextMenuContextValue | null>(null);

function visibleItems(items: AppContextMenuItem[]) {
  // Inline editor empty string ile SQL NULL değerini henüz ayrı state olarak tutmadığı için
  // yanlış veri yazma riski taşıyan hızlı NULL eylemi menüde gösterilmez.
  return items.filter(item => item.id !== 'set-null');
}

function MenuItems({ items, closeMenu }: { items: AppContextMenuItem[]; closeMenu: () => void }) {
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);

  return (
    <div className="min-w-56 py-1">
      {visibleItems(items).map(item => {
        if (item.separator) {
          return <div key={item.id} className="my-1 h-px bg-zinc-800" />;
        }

        const Icon = item.icon;
        const children = visibleItems(item.children || []);
        const hasChildren = children.length > 0;

        return (
          <div
            key={item.id}
            className="relative px-1"
            onMouseEnter={() => setOpenSubmenuId(hasChildren ? item.id : null)}
            onMouseLeave={() => hasChildren && setOpenSubmenuId(null)}
          >
            <button
              type="button"
              disabled={item.disabled}
              className={`flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[11px] outline-none transition-colors ${
                item.disabled
                  ? 'cursor-not-allowed text-zinc-700'
                  : item.danger
                    ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                    : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
              onClick={async () => {
                if (item.disabled || hasChildren) return;
                closeMenu();
                await item.onSelect?.();
              }}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {Icon && <Icon className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.shortcut && <span className="ml-4 shrink-0 text-[10px] text-zinc-600">{item.shortcut}</span>}
              {hasChildren && <ChevronRight className="h-3 w-3 shrink-0 text-zinc-600" />}
            </button>

            {hasChildren && openSubmenuId === item.id && (
              <div className="absolute left-[calc(100%-4px)] top-0 z-[210] rounded-md border border-zinc-800 bg-zinc-950 shadow-2xl">
                <MenuItems items={children} closeMenu={closeMenu} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AppContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeContextMenu = useCallback(() => setMenu(null), []);

  const openContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, items: AppContextMenuItem[], title?: string) => {
      event.preventDefault();
      event.stopPropagation();
      const nextItems = visibleItems(items);
      if (!nextItems.length) return;
      const x = event.clientX;
      const y = event.clientY;
      setMenuPosition({ x, y });
      setMenu({ x, y, items: nextItems, title });
    },
    []
  );

  useEffect(() => {
    if (!menu) return;

    const close = () => closeContextMenu();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menu, closeContextMenu]);

  useEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(8, window.innerHeight - rect.height - 8);
    const nextX = Math.max(8, Math.min(menu.x, maxX));
    const nextY = Math.max(8, Math.min(menu.y, maxY));

    setMenuPosition(current =>
      Math.abs(current.x - nextX) < 0.5 && Math.abs(current.y - nextY) < 0.5
        ? current
        : { x: nextX, y: nextY }
    );
  }, [menu]);

  const contextValue = useMemo(() => ({ openContextMenu, closeContextMenu }), [openContextMenu, closeContextMenu]);

  return (
    <AppContextMenuContext.Provider value={contextValue}>
      {children}
      {menu && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[200] overflow-visible rounded-md border border-zinc-800 bg-zinc-950/98 shadow-2xl backdrop-blur"
            style={{ left: menuPosition.x, top: menuPosition.y }}
            onMouseDown={event => event.stopPropagation()}
            onContextMenu={event => event.preventDefault()}
          >
            {menu.title && <div className="border-b border-zinc-800 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">{menu.title}</div>}
            <MenuItems items={menu.items} closeMenu={closeContextMenu} />
          </div>,
          document.body
        )}
    </AppContextMenuContext.Provider>
  );
}

export function useAppContextMenu() {
  const context = useContext(AppContextMenuContext);
  if (!context) throw new Error('useAppContextMenu, AppContextMenuProvider içinde kullanılmalıdır.');
  return context;
}
