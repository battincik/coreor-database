'use client';

import { useEffect, useState } from 'react';
import { Database, Laptop, TerminalSquare } from 'lucide-react';
import { CoreorLoadingScreen } from '@/components/coreor-loading-screen';
import { useLanguage } from '@/context/LanguageContext';

export function NativeRuntimeGuard({ children }: { children: React.ReactNode }) {
  const {t}=useLanguage();
  const [native, setNative] = useState<boolean | null>(null);

  useEffect(() => {
    setNative(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
  }, []);

  if (native === null) {
    return <CoreorLoadingScreen description={t('nativeRuntime.preparing')} />;
  }

  if (!native) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-zinc-100">
        <section className="w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10">
              <Database className="h-5 w-5 text-cyan-300" />
            </span>
            <div>
              <h1 className="text-base font-semibold">{t('nativeRuntime.required')}</h1>
              <p className="mt-1 text-[10px] text-zinc-500">{t('nativeRuntime.notHosted')}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4">
              <Laptop className="h-4 w-4 text-emerald-400" />
              <div className="mt-2 text-[11px] font-medium">Windows • macOS • Linux</div>
              <p className="mt-1 text-[9px] leading-4 text-zinc-600">{t('nativeRuntime.useNative')}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4">
              <TerminalSquare className="h-4 w-4 text-purple-400" />
              <div className="mt-2 font-mono text-[10px] text-zinc-300">npm run tauri:dev</div>
              <p className="mt-1 text-[9px] leading-4 text-zinc-600">{t('nativeRuntime.devShell')}</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
