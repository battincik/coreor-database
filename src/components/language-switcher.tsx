'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Database, Globe2, HardDrive, Languages, Search, X } from 'lucide-react';
import { SUPPORTED_LANGUAGES, useLanguage } from '@/context/LanguageContext';

export function LanguageSwitcher() {
  const { language, currentLanguage, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        setOpen(previous => !previous);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    const customOpen = () => setOpen(true);
    window.addEventListener('keydown', shortcut);
    window.addEventListener('coreor:open-language-switcher', customOpen);
    return () => {
      window.removeEventListener('keydown', shortcut);
      window.removeEventListener('coreor:open-language-switcher', customOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR');
    if (!normalized) return SUPPORTED_LANGUAGES;
    return SUPPORTED_LANGUAGES.filter(item =>
      `${item.code} ${item.nativeName} ${item.englishName} ${item.region} ${item.searchTerms.join(' ')}`
        .toLocaleLowerCase('tr-TR')
        .includes(normalized)
    );
  }, [query]);

  const choose = (code: typeof language) => {
    const next = SUPPORTED_LANGUAGES.find(item => item.code === code);
    setLanguage(code);
    setOpen(false);
    setQuery('');
    window.dispatchEvent(new CustomEvent('coreor:language-changed', { detail: { language: code, name: next?.nativeName } }));
  };

  return (
    <>
      <button
        type="button"
        data-i18n-ignore
        onClick={() => setOpen(true)}
        className="fixed bottom-10 right-3 z-[320] flex h-8 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/95 px-2.5 text-[9px] font-medium text-zinc-400 shadow-xl backdrop-blur hover:border-cyan-500/35 hover:text-cyan-200"
        title={`${t('settings.language.title')} • Ctrl/⌘ + Shift + L`}
        aria-label={t('settings.language.title')}
      >
        <Globe2 className="h-3.5 w-3.5 text-cyan-400" />
        <span>{currentLanguage.nativeName}</span>
        <span className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-[8px] text-zinc-600">{language}</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[720] flex items-center justify-center p-4" data-i18n-ignore>
          <button type="button" aria-label={t('common.close')} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setOpen(false)} />
          <section className="relative z-10 flex max-h-[min(760px,calc(100dvh-24px))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl" dir={currentLanguage.direction}>
            <header className="flex items-start gap-3 border-b border-zinc-800 px-5 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10">
                <Languages className="h-5 w-5 text-cyan-300" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-zinc-100">{t('settings.language.title')}</h2>
                <p className="mt-1 text-[10px] leading-5 text-zinc-500">{t('settings.language.description')}</p>
              </div>
              <button type="button" className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-900 hover:text-zinc-200" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="grid gap-2 border-b border-zinc-800 bg-black/20 p-4 sm:grid-cols-3">
              <InfoCard icon={Globe2} label={t('settings.language.current')} value={currentLanguage.nativeName} />
              <InfoCard icon={Database} label={t('settings.language.coverage')} value="SQL • DB • DevTools" />
              <InfoCard icon={HardDrive} label={t('settings.language.localStorage')} value={t('settings.language.restartNotRequired')} />
            </div>

            <div className="border-b border-zinc-800 p-4">
              <div className="flex h-10 items-center gap-2 rounded-xl border border-zinc-800 bg-black/30 px-3 focus-within:border-cyan-500/40">
                <Search className="h-4 w-4 text-cyan-400" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder={t('common.searchOptions')}
                  className="min-w-0 flex-1 bg-transparent text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <kbd className="rounded border border-zinc-800 px-1.5 py-0.5 text-[8px] text-zinc-600">ESC</kbd>
              </div>
            </div>

            <div className="coreor-table-scroll min-h-0 flex-1 overflow-y-auto p-4">
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-12 text-center text-[10px] text-zinc-600">{t('common.noResults')}</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map(item => {
                    const active = item.code === language;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => choose(item.code)}
                        className={`group flex min-h-24 items-start gap-3 rounded-2xl border p-4 text-left transition ${active ? 'border-cyan-500/35 bg-cyan-500/[0.08]' : 'border-zinc-800 bg-black/20 hover:border-zinc-700 hover:bg-white/[0.025]'}`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-mono text-[10px] ${active ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-zinc-800 bg-zinc-950 text-zinc-600'}`}>
                          {item.code.split('-')[0].toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[11px] font-semibold text-zinc-100">
                            {item.nativeName}
                            {active && <Check className="h-3.5 w-3.5 text-cyan-400" />}
                          </span>
                          <span className="mt-1 block text-[9px] text-zinc-500">{item.englishName}</span>
                          <span className="mt-2 block truncate text-[8px] text-zinc-700">{item.region} • {item.direction.toUpperCase()}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 bg-black/20 px-5 py-3 text-[8px] text-zinc-600">
              <span>{t('notification.localOnly')}</span>
              <span>{t('common.optionsCount', { count: SUPPORTED_LANGUAGES.length })}</span>
            </footer>
          </section>
        </div>,
        document.body
      )}
    </>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="flex items-center gap-1.5 text-[8px] text-zinc-600"><Icon className="h-3 w-3" />{label}</div>
      <div className="mt-1.5 truncate text-[10px] text-zinc-300">{value}</div>
    </div>
  );
}
