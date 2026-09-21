'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export interface SearchSelectOption<T extends string | number = string> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
  keywords?: string[];
}

interface SearchSelectProps<T extends string | number = string> {
  value: T;
  options: SearchSelectOption<T>[];
  onValueChange: (value: T) => void;
  placeholder?: string;
  triggerLabel?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  dropdownMinWidth?: number;
  dropdownMaxWidth?: number;
  showDescriptionInTrigger?: boolean;
  portal?: boolean;
}

interface PanelPosition {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
}

export function SearchSelect<T extends string | number = string>({
  value,
  options,
  onValueChange,
  placeholder,
  triggerLabel,
  searchPlaceholder,
  emptyText,
  disabled = false,
  className = '',
  triggerClassName = '',
  dropdownMinWidth = 340,
  dropdownMaxWidth = 440,
  showDescriptionInTrigger = true,
  portal = true
}: SearchSelectProps<T>) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find(option => String(option.value) === String(value));
  const usePortal = portal || dropdownMinWidth > 340;
  const resolvedPlaceholder = placeholder ?? t('control.select.placeholder');
  const displayLabel = triggerLabel ?? selected?.label ?? resolvedPlaceholder;
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('control.select.search');
  const resolvedEmptyText = emptyText ?? t('control.select.empty');

  const updatePanelPosition = useCallback(() => {
    if (!usePortal) return;
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 7;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
    const availableAbove = rect.top - viewportPadding - gap;
    const placement: PanelPosition['placement'] = availableBelow < 250 && availableAbove > availableBelow ? 'top' : 'bottom';
    const availableHeight = placement === 'top' ? availableAbove : availableBelow;
    const maxHeight = Math.max(120, Math.min(360, availableHeight));
    const width = Math.min(
      Math.max(rect.width, dropdownMinWidth),
      dropdownMaxWidth,
      window.innerWidth - viewportPadding * 2
    );
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
    );

    setPanelPosition({
      left,
      width,
      maxHeight,
      placement,
      ...(placement === 'bottom'
        ? { top: rect.bottom + gap }
        : { bottom: window.innerHeight - rect.top + gap })
    });
  }, [dropdownMaxWidth, dropdownMinWidth, usePortal]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', keydown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !usePortal) {
      setPanelPosition(null);
      return;
    }

    updatePanelPosition();
    const reposition = () => updatePanelPosition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
    if (triggerRef.current) observer?.observe(triggerRef.current);

    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      observer?.disconnect();
    };
  }, [open, updatePanelPosition, usePortal]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(language);
    if (!normalized) return options;
    return options.filter(option =>
      `${option.label} ${option.description || ''} ${String(option.value)} ${(option.keywords || []).join(' ')}`
        .toLocaleLowerCase(language)
        .includes(normalized)
    );
  }, [language, options, query]);

  const panelContents = (
    <div className="flex min-h-0 w-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/70 px-3">
        <Search className="h-3.5 w-3.5 text-cyan-400" />
        <input
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={resolvedSearchPlaceholder}
          aria-label={resolvedSearchPlaceholder}
          className="h-8 min-w-0 flex-1 bg-transparent text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        {query && (
          <button type="button" aria-label={t('common.reset')} title={t('common.reset')} className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300" onClick={() => setQuery('')}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5" role="listbox" aria-label={resolvedPlaceholder}>
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-[10px] text-zinc-600">{resolvedEmptyText}</div>
        ) : filtered.map(option => {
          const active = option === selected;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
                setQuery('');
              }}
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${active ? 'bg-cyan-500/12 text-cyan-50' : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100'}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold">{option.label}</span>
                {option.description && <span className="mt-1 block text-[9px] leading-4 text-zinc-500">{option.description}</span>}
              </span>
              {option.badge && <span className="mt-0.5 shrink-0 rounded-full border border-zinc-700 bg-black/25 px-2 py-0.5 text-[8px] text-zinc-400">{option.badge}</span>}
              {active && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />}
            </button>
          );
        })}
      </div>
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-zinc-800 bg-black/30 px-3 text-[8px] text-zinc-600">
        <span>{t('control.select.count', { count: filtered.length })}</span>
        <span>{t('control.select.escape')}</span>
      </div>
    </div>
  );

  const panel = !open || typeof document === 'undefined'
    ? null
    : usePortal
      ? panelPosition
        ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[520] flex overflow-hidden rounded-2xl border border-zinc-700/90 bg-zinc-950/98 shadow-[0_24px_70px_rgba(0,0,0,0.72)] backdrop-blur-xl"
            style={{
              left: panelPosition.left,
              top: panelPosition.top,
              bottom: panelPosition.bottom,
              width: panelPosition.width,
              maxHeight: panelPosition.maxHeight
            }}
          >
            {panelContents}
          </div>,
          document.body
        )
        : null
      : (
        <div ref={panelRef} className="absolute left-0 right-0 top-[calc(100%+7px)] z-[420] flex max-h-80 overflow-hidden rounded-2xl border border-zinc-700/90 bg-zinc-950/98 shadow-2xl backdrop-blur-xl">
          {panelContents}
        </div>
      );

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${open ? t('control.select.close') : t('control.select.open')}: ${displayLabel}`}
        title={open ? t('control.select.close') : t('control.select.open')}
        onClick={() => setOpen(previous => !previous)}
        className={`flex min-h-10 w-full min-w-0 items-center gap-2.5 rounded-xl border px-3 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? 'border-cyan-500/55 bg-cyan-500/[0.06] shadow-[0_0_0_3px_rgba(6,182,212,0.07)]'
            : 'border-zinc-800 bg-zinc-950/80 hover:border-zinc-700 hover:bg-white/[0.025]'
        } ${triggerClassName}`}
      >
        <span className="min-w-0 flex-1 py-1.5">
          <span className={`block truncate text-[11px] font-semibold ${selected || triggerLabel ? 'text-zinc-100' : 'text-zinc-600'}`}>
            {displayLabel}
          </span>
          {showDescriptionInTrigger && selected?.description && <span className="mt-0.5 block truncate text-[9px] text-zinc-600">{selected.description}</span>}
        </span>
        {selected?.badge && <span className="max-w-20 shrink-0 truncate rounded-full border border-zinc-800 bg-black/20 px-2 py-0.5 text-[8px] text-zinc-500">{selected.badge}</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-600 transition-transform ${open ? 'rotate-180 text-cyan-400' : ''}`} />
      </button>
      {panel}
    </div>
  );
}
