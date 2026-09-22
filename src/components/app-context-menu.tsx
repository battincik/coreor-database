'use client';

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { shortcutLabel, type ShortcutId } from '@/lib/shortcuts';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

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

interface SubmenuState {
  id: string;
  anchorLeft: number;
  anchorRight: number;
  anchorTop: number;
  anchorBottom: number;
  focus: boolean;
}

const MENU_SURFACE_CLASS =
  'w-max min-w-60 max-w-[min(320px,calc(100vw-16px))] overflow-visible rounded-xl border border-zinc-700/80 bg-zinc-950/98 shadow-[0_18px_70px_rgba(0,0,0,.68)] backdrop-blur-xl';

interface MenuBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function menuBounds(anchorY?: number): MenuBounds {
  const margin = 8;
  const topChrome = document.querySelector<HTMLElement>('[data-coreor-app-chrome="top"]')?.getBoundingClientRect();
  const bottomChrome = document.querySelector<HTMLElement>('[data-coreor-app-chrome="bottom"]')?.getBoundingClientRect();

  // A context menu opened from inside app chrome must be allowed to render over that
  // chrome. Otherwise a menu opened from SQL Log is clamped above the whole bottom bar.
  const insideTopChrome = Boolean(topChrome && anchorY !== undefined && anchorY >= topChrome.top && anchorY <= topChrome.bottom);
  const insideBottomChrome = Boolean(bottomChrome && anchorY !== undefined && anchorY >= bottomChrome.top && anchorY <= bottomChrome.bottom);

  const top = insideTopChrome
    ? margin
    : Math.max(margin, topChrome ? topChrome.bottom + 4 : margin);
  const bottom = insideBottomChrome
    ? window.innerHeight - margin
    : Math.min(window.innerHeight - margin, bottomChrome ? bottomChrome.top - 4 : window.innerHeight - margin);

  return {
    left: margin,
    right: Math.max(margin, window.innerWidth - margin),
    top,
    bottom: Math.max(top + 40, bottom)
  };
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function MenuItems({
  items,
  closeMenu,
  onBack,
  autoFocus = false,
  maxHeight
}: {
  items: AppContextMenuItem[];
  closeMenu: () => void;
  onBack?: () => void;
  autoFocus?: boolean;
  maxHeight?: number;
}) {
  const {t}=useLanguage();
  const menuItems = visibleItems(items);
  const selectable = menuItems.filter(item => !item.separator);
  const [submenu, setSubmenu] = useState<SubmenuState | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<{ x: number; y: number; ready: boolean; maxHeight: number }>({
    x: 0,
    y: 0,
    ready: false,
    maxHeight: 520
  });
  const [activeId, setActiveId] = useState<string | null>(() => selectable[0]?.id || null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const typeaheadRef = useRef('');
  const typeaheadTimer = useRef<number | null>(null);

  useEffect(() => {
    if (autoFocus) rootRef.current?.focus();
    return () => { if (typeaheadTimer.current) window.clearTimeout(typeaheadTimer.current); };
  }, [autoFocus]);

  const openSubmenu = (item: AppContextMenuItem, focus: boolean) => {
    if (item.disabled || !item.children?.length || !rootRef.current) return;
    const anchor = rootRef.current.querySelector<HTMLElement>(`[data-menu-id="${CSS.escape(item.id)}"]`);
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const bounds = menuBounds(rect.top);
    setSubmenuPosition({
      x: rect.right - 4,
      y: rect.top,
      ready: false,
      maxHeight: Math.max(120, Math.min(520, bounds.bottom - bounds.top))
    });
    setSubmenu({
      id: item.id,
      anchorLeft: rect.left,
      anchorRight: rect.right,
      anchorTop: rect.top,
      anchorBottom: rect.bottom,
      focus
    });
  };

  useLayoutEffect(() => {
    if (!submenu || !submenuRef.current) return;
    const rect = submenuRef.current.getBoundingClientRect();
    const bounds = menuBounds(submenu.anchorTop);
    const overlap = 4;

    const fitsRight = submenu.anchorRight + rect.width - overlap <= bounds.right;
    const fitsLeft = submenu.anchorLeft - rect.width + overlap >= bounds.left;
    const x = fitsRight
      ? submenu.anchorRight - overlap
      : fitsLeft
        ? submenu.anchorLeft - rect.width + overlap
        : clampValue(submenu.anchorRight - overlap, bounds.left, bounds.right - rect.width);

    const alignTop = submenu.anchorTop;
    const alignBottom = submenu.anchorBottom - rect.height;
    const fitsDown = alignTop + rect.height <= bounds.bottom;
    const fitsUp = alignBottom >= bounds.top;
    const y = fitsDown
      ? alignTop
      : fitsUp
        ? alignBottom
        : clampValue(alignTop, bounds.top, bounds.bottom - rect.height);

    setSubmenuPosition({
      x: clampValue(x, bounds.left, bounds.right - rect.width),
      y: clampValue(y, bounds.top, bounds.bottom - rect.height),
      ready: true,
      maxHeight: Math.max(120, Math.min(520, bounds.bottom - bounds.top))
    });
  }, [submenu]);
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
        className="min-w-60 overflow-y-auto py-1 outline-none"
        style={{ maxHeight: maxHeight ?? 'min(70vh, 520px)' }}
        onKeyDown={event => {
          event.stopPropagation();
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
          const hasChildren = !item.disabled && visibleItems(item.children || []).length > 0;
          const active = activeId === item.id;
          return (
            <div key={item.id} className="px-1" onMouseEnter={() => { setActiveId(item.id); if (hasChildren) openSubmenu(item, false); else setSubmenu(null); }}>
              <button
                type="button"
                role="menuitem"
                data-menu-id={item.id}
                aria-disabled={item.disabled || undefined}
                title={item.disabled ? item.disabledReason || t('contextMenu.unavailable') : undefined}
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
          ref={submenuRef}
          data-coreor-context-menu="true"
          className={`fixed z-[2147483310] ${MENU_SURFACE_CLASS}`}
          style={{
            left: submenuPosition.x,
            top: submenuPosition.y,
            visibility: submenuPosition.ready ? 'visible' : 'hidden'
          }}
          onMouseDown={event => event.stopPropagation()}
          onContextMenu={event => event.preventDefault()}
        >
          <MenuItems
            items={activeSubmenuChildren}
            closeMenu={closeMenu}
            autoFocus={submenu.focus}
            maxHeight={submenuPosition.maxHeight}
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
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0, ready: false, maxHeight: 520 });
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
      const bounds = menuBounds(y);
      setMenuPosition({
        x,
        y,
        ready: false,
        maxHeight: Math.max(120, Math.min(520, bounds.bottom - bounds.top - (title ? 34 : 0)))
      });
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

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const bounds = menuBounds(menu.y);
    const nextX = clampValue(menu.x, bounds.left, bounds.right - rect.width);
    const nextY = clampValue(menu.y, bounds.top, bounds.bottom - rect.height);
    const maxHeight = Math.max(120, Math.min(520, bounds.bottom - bounds.top - (menu.title ? 34 : 0)));

    setMenuPosition({
      x: nextX,
      y: nextY,
      ready: true,
      maxHeight
    });
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
            data-coreor-context-menu="true"
            className={`fixed z-[2147483300] ${MENU_SURFACE_CLASS}`}
            style={{
              left: menuPosition.x,
              top: menuPosition.y,
              visibility: menuPosition.ready ? 'visible' : 'hidden'
            }}
            onMouseDown={event => event.stopPropagation()}
            onContextMenu={event => event.preventDefault()}
          >
            {menu.title && <div className="max-w-80 truncate border-b border-zinc-800 px-3 py-2 text-[10px] font-medium text-zinc-500">{menu.title}</div>}
            <MenuItems items={menu.items} closeMenu={closeContextMenu} autoFocus maxHeight={menuPosition.maxHeight} />
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
