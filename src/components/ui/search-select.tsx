'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SearchSelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
  keywords?: string[];
}

interface SearchSelectProps<T extends string = string> {
  value: T;
  options: SearchSelectOption<T>[];
  onValueChange: (value: T) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchSelect<T extends string = string>({
  value,
  options,
  onValueChange,
  placeholder = 'Seçim yapın',
  searchPlaceholder = 'Seçenek ara…',
  emptyText = 'Eşleşen seçenek bulunamadı.',
  disabled = false,
  className = ''
}: SearchSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find(option => option.value === value);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR');
    if (!normalized) return options;
    return options.filter(option =>
      `${option.label} ${option.description || ''} ${(option.keywords || []).join(' ')}`
        .toLocaleLowerCase('tr-TR')
        .includes(normalized)
    );
  }, [options, query]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(previous => !previous)}
        className={`flex min-h-10 w-full items-center gap-3 rounded-xl border px-3 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? 'border-cyan-500/45 bg-cyan-500/[0.05] shadow-[0_0_0_3px_rgba(6,182,212,0.06)]'
            : 'border-zinc-800 bg-zinc-950/80 hover:border-zinc-700 hover:bg-white/[0.025]'
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[11px] font-medium ${selected ? 'text-zinc-200' : 'text-zinc-600'}`}>
            {selected?.label || placeholder}
          </span>
          {selected?.description && <span className="mt-0.5 block truncate text-[9px] text-zinc-600">{selected.description}</span>}
        </span>
        {selected?.badge && <span className="rounded-full border border-zinc-800 bg-black/20 px-2 py-0.5 text-[8px] text-zinc-500">{selected.badge}</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[420] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-zinc-800 p-2">
            <Search className="h-3.5 w-3.5 text-zinc-600" />
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-7 min-w-0 flex-1 bg-transparent text-[10px] text-zinc-200 outline-none placeholder:text-zinc-700"
            />
            {query && (
              <button type="button" className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300" onClick={() => setQuery('')}>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5" role="listbox">
            {filtered.length === 0 ? (
              <div className="px-3 py-8 text-center text-[10px] text-zinc-600">{emptyText}</div>
            ) : filtered.map(option => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onValueChange(option.value);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition ${active ? 'bg-cyan-500/10 text-cyan-100' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium">{option.label}</span>
                    {option.description && <span className="mt-0.5 block text-[9px] leading-4 text-zinc-600">{option.description}</span>}
                  </span>
                  {option.badge && <span className="mt-0.5 rounded-full border border-zinc-800 px-2 py-0.5 text-[8px] text-zinc-600">{option.badge}</span>}
                  {active && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
