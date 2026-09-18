'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { shortcutLabel, type ShortcutId } from '@/lib/shortcuts';
import type { LucideIcon } from 'lucide-react';

export interface AppContextMenuItem {
  id: string;
  label?: string;
  icon?: LucideIcon;
  shortcut?: ShortcutId | string;
  disabled?: boolean;
  disabledReason?: string;
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

interface SubmenuState { id: string; x: number; y: number; focus: boolean }

function MenuItems({ items, closeMenu, onBack, autoFocus = false }: { items: AppContextMenuItem[]; closeMenu: () => void; onBack?: () => void; autoFocus?: boolean }) {
  const menuItems = visibleItems(items);
  const selectable = menuItems.filter(item => !item.separator);
  const [submenu, setSubmenu] = useState<SubmenuState | null>(null);
  const [activeId, setActiveId] = useState<string | null>(() => selectable[0]?.id || null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const typeaheadRef = useRef('');
  const typeaheadTimer = useRef<number | null>(null);

  useEffect(() => {
    if (autoFocus) rootRef.current?.focus();
    return () => { if (typeaheadTimer.current) window.clearTimeout(typeaheadTimer.current); };
  }, [autoFocus]);

  const openSubmenu = (item: AppContextMenuItem, focus: boolean) => {
    if (!item.children?.length || !rootRef.current) return;
    const anchor = rootRef.current.querySelector<HTMLElement>(`[data-menu-id="${CSS.escape(item.id)}"]`);
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = 270;
    const x = rect.right + width > window.innerWidth - 8 ? Math.max(8, rect.left - width + 4) : rect.right - 4;
    const y = Math.max(8, Math.min(rect.top, window.innerHeight - 420));
    setSubmenu({ id: item.id, x, y, focus });
  };
  const move = (direction: 1 | -1) => {
    if (!selectable.length) return;
    const current = Math.max(0, selectable.findIndex(item => item.id === activeId));
    const next = (current + direction + selectable.length) % selectable.length;
    setActiveId(selectable[next].id);
    setSubmenu(null);
    rootRef.current?.querySelector<HTMLElement>(`[data-menu-id="${CSS.escape(selectable[next].id)}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  const activate = async (item?: AppContextMenuItem) => {
    if (!item || item.disabled) return;
    const children = visibleItems(item.children || []);
    if (children.length) { openSubmenu(item, true); return; }
    closeMenu();
    await item.onSelect?.();
  };

  const activeSubmenuItem = selectable.find(item => item.id === submenu?.id);
  const activeSubmenuChildren = visibleItems(activeSubmenuItem?.children || []);

  return (
    <>
      <div
        ref={rootRef}
        role="menu"
        tabIndex={0}
        className="max-h-[min(70vh,520px)] min-w-60 overflow-y-auto py-1 outline-none"
        onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
          else if (event.key === 'ArrowRight') {
            event.preventDefault();
            const item = selectable.find(entry => entry.id === activeId);
            if (item?.children?.length) openSubmenu(item, true);
          } else if (event.key === 'ArrowLeft' && onBack) { event.preventDefault(); onBack(); }
          else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void activate(selectable.find(item => item.id === activeId)); }
          else if (event.key === 'Home') { event.preventDefault(); setActiveId(selectable[0]?.id || null); setSubmenu(null); }
          else if (event.key === 'End') { event.preventDefault(); setActiveId(selectable.at(-1)?.id || null); setSubmenu(null); }
          else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            typeaheadRef.current += event.key.toLocaleLowerCase('tr-TR');
            if (typeaheadTimer.current) window.clearTimeout(typeaheadTimer.current);
            typeaheadTimer.current = window.setTimeout(() => { typeaheadRef.current = ''; }, 650);
            const match = selectable.find(item => item.label?.toLocaleLowerCase('tr-TR').startsWith(typeaheadRef.current));
            if (match) { setActiveId(match.id); setSubmenu(null); }
          }
        }}
      >
        {menuItems.map(item => {
          if (item.separator) return <div key={item.id} role="separator" className="my-1 h-px bg-zinc-800" />;
          const Icon = item.icon;
          const hasChildren = visibleItems(item.children || []).length > 0;
          const active = activeId === item.id;
          return (
            <div key={item.id} className="px-1" onMouseEnter={() => { setActiveId(item.id); if (hasChildren) openSubmenu(item, false); else setSubmenu(null); }}>
              <button
                type="button"
                role="menuitem"
                data-menu-id={item.id}
                aria-disabled={item.disabled || undefined}
                title={item.disabled ? item.disabledReason || 'Bu işlem şu anda kullanılamıyor.' : undefined}
                className={`flex min-h-7 w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[11px] outline-none transition-colors ${item.disabled
                  ? 'cursor-not-allowed text-zinc-700'
                  : item.danger
                    ? active ? 'bg-red-500/12 text-red-300' : 'text-red-400 hover:bg-red-500/10'
                    : active ? 'bg-cyan-500/10 text-cyan-100' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                onClick={() => void activate(item)}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">{Icon && <Icon className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.disabled && item.disabledReason && <span className="block max-w-64 truncate text-[9px] font-normal text-zinc-700">{item.disabledReason}</span>}
                </span>
                {item.shortcut && <span className="ml-4 shrink-0 font-mono text-[9px] text-zinc-600">{shortcutLabel(item.shortcut)}</span>}
                {hasChildren && <ChevronRight className="h-3 w-3 shrink-0 text-zinc-600" />}
              </button>
            </div>
          );
        })}
      </div>
      {submenu && activeSubmenuChildren.length > 0 && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[1810] rounded-xl border border-zinc-700/80 bg-zinc-950 shadow-[0_18px_55px_rgba(0,0,0,.62)]"
          style={{ left: submenu.x, top: submenu.y }}
          onMouseDown={event => event.stopPropagation()}
        >
          <MenuItems
            items={activeSubmenuChildren}
            closeMenu={closeMenu}
            autoFocus={submenu.focus}
            onBack={() => {
              setSubmenu(null);
              window.requestAnimationFrame(() => rootRef.current?.focus());
            }}
          />
        </div>,
        document.body
      )}
    </>
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
            className="fixed z-[1800] min-w-60 overflow-visible rounded-xl border border-zinc-700/80 bg-zinc-950/98 shadow-[0_18px_70px_rgba(0,0,0,.68)] backdrop-blur-xl"
            style={{ left: menuPosition.x, top: menuPosition.y }}
            onMouseDown={event => event.stopPropagation()}
            onContextMenu={event => event.preventDefault()}
          >
            {menu.title && <div className="max-w-80 truncate border-b border-zinc-800 px-3 py-2 text-[10px] font-medium text-zinc-500">{menu.title}</div>}
            <MenuItems items={menu.items} closeMenu={closeContextMenu} autoFocus />
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
