'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Download, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import { Button } from '@/components/ui/button';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { useLanguage } from '@/context/LanguageContext';
import { useAppPreferences } from '@/lib/appPreferences';
import { checkForUpdates, installUpdate, useAppUpdater } from '@/lib/appUpdater';
import { APP_VERSION } from '@/lib/appVersion';
import { isDesktopRuntime } from '@/lib/desktopClient';
import { updateActivity } from '@/lib/updateActivity';

export function AppUpdateSettings() {
  const { t, formatDate } = useLanguage();
  const { preferences, setPreferences } = useAppPreferences();
  const update = useAppUpdater();
  const activeWork = useSyncExternalStore(updateActivity.subscribe, updateActivity.count, () => 0);
  const desktop = isDesktopRuntime();
  const busy = ['checking', 'downloading', 'verifying', 'installing'].includes(update.phase);
  const canInstall = desktop && update.phase === 'available' && Boolean(update.version) && activeWork === 0;

  const intervalOptions = useMemo<SearchSelectOption<number>[]>(() =>
    [15, 30, 60, 120, 240].map(minutes => ({
      value: minutes,
      label: t('updates.minutes', { count: minutes }),
      description: minutes === 60 ? t('updates.intervalRecommended') : undefined,
      badge: minutes === 60 ? t('common.default') : undefined
    })), [t]);

  const statusTone = update.phase === 'error'
    ? 'border-red-500/20 bg-red-500/[0.05] text-red-300'
    : update.phase === 'available'
      ? 'border-cyan-500/20 bg-cyan-500/[0.05] text-cyan-200'
      : update.phase === 'disabled'
        ? 'border-amber-500/20 bg-amber-500/[0.05] text-amber-200'
        : 'border-zinc-800 bg-zinc-950 text-zinc-300';

  const status = !desktop
    ? t('updates.desktopOnly')
    : update.phase === 'idle' && !update.checkedAt
      ? t('updates.notCheckedYet')
      : t(`updates.${update.phase}`);

  const latest = update.version
    ? `v${update.version}`
    : update.phase === 'idle' && update.checkedAt
      ? t('updates.noUpdateAction')
      : '—';

  return (
    <div className="space-y-4">
      <section className="min-w-0 rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.06] via-transparent to-transparent p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/[0.08]">
            <RefreshCw className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-100">{t('updates.updateTitle')}</h3>
            <p className="mt-1 text-[10px] leading-5 text-zinc-500">{t('updates.updateDescription')}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-black/25 p-3">
            <div className="text-[9px] text-zinc-500">{t('updates.installedVersion')}</div>
            <div className="mt-2 break-all font-mono text-xl font-semibold text-zinc-100">v{APP_VERSION}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-black/25 p-3">
            <div className="text-[9px] text-zinc-500">{t('updates.detectedVersion')}</div>
            <div className="mt-2 break-all font-mono text-xl font-semibold text-cyan-300">{latest}</div>
          </div>
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-zinc-800 bg-black/20 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-cyan-400" />
          <h3 className="text-xs font-semibold">{t('updates.status')}</h3>
        </div>
        <div role="status" aria-live="polite" className={`mt-3 rounded-xl border px-3 py-3 ${statusTone}`}>
          <div className="flex items-center gap-2 text-[10px] font-medium">
            {busy
              ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              : update.phase === 'error' || update.phase === 'disabled'
                ? <AlertTriangle className="h-4 w-4 shrink-0" />
                : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            <span>{status}</span>
          </div>
          {update.phase === 'disabled' && (
            <div className="mt-2 text-[9px] opacity-80">{t(update.development ? 'updates.devDisabled' : 'updates.keyMissing')}</div>
          )}
          {update.error && (
            <div role="alert" className="mt-2 text-[9px] leading-4 text-red-300">{t(`updates.errors.${update.error}`)}</div>
          )}
          {update.phase === 'downloading' && (
            <div className="mt-3">
              <div
                role="progressbar"
                aria-label={t('updates.downloading')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={update.progress ?? undefined}
                className="h-1.5 overflow-hidden rounded-full bg-zinc-800"
              >
                <div
                  className={`h-full rounded-full bg-cyan-400 transition-[width] duration-200 ${update.progress === null ? 'w-full animate-pulse opacity-50' : ''}`}
                  style={update.progress === null ? undefined : { width: `${update.progress}%` }}
                />
              </div>
              <div className="mt-1 text-right font-mono text-[9px] text-zinc-400">
                {update.progress === null ? t('updates.progressUnknown') : `${update.progress}%`}
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[9px] text-zinc-500">
          <span>{t('updates.lastCheck')}</span>
          <time dateTime={update.checkedAt ? new Date(update.checkedAt).toISOString() : undefined}>
            {update.checkedAt ? formatDate(update.checkedAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('updates.notCheckedYet')}
          </time>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button variant="outline" className="w-full" disabled={!desktop || busy} onClick={() => void checkForUpdates()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            {t('updates.checkNow')}
          </Button>
          <Button className="w-full" disabled={!canInstall} onClick={() => void installUpdate()}>
            <Download className="mr-2 h-3.5 w-3.5" />
            {update.version ? t('updates.install', { version: update.version }) : t('updates.noUpdateAction')}
          </Button>
        </div>
        {update.version && activeWork > 0 && (
          <div className="mt-3 text-[9px] leading-4 text-amber-300">{t('updates.busy')}</div>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-zinc-800 bg-black/20 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
          <h3 className="text-xs font-semibold">{t('updates.preferencesTitle')}</h3>
        </div>
        <div className="mt-2 grid min-h-16 min-w-0 items-center gap-3 border-b border-zinc-800/70 py-3 xl:grid-cols-[minmax(180px,.8fr)_minmax(0,1.4fr)]">
          <div>
            <div className="text-[11px] font-medium">{t('updates.autoInstall')}</div>
            <p className="mt-1 text-[9px] leading-4 text-zinc-600">{t('updates.autoInstallDescription')}</p>
          </div>
          <CoreorSwitch
            checked={preferences.autoInstallUpdates}
            onCheckedChange={autoInstallUpdates => setPreferences({ autoInstallUpdates })}
            label={t('updates.autoInstall')}
          />
        </div>
        <div className="grid min-h-16 min-w-0 items-center gap-3 py-3 xl:grid-cols-[minmax(180px,.8fr)_minmax(0,1.4fr)]">
          <div>
            <div className="text-[11px] font-medium">{t('updates.interval')}</div>
            <p className="mt-1 text-[9px] leading-4 text-zinc-600">{t('updates.intervalDescription')}</p>
          </div>
          <div className="min-w-0">
            <SearchSelect
              value={preferences.updateCheckMinutes}
              options={intervalOptions}
              onValueChange={updateCheckMinutes => setPreferences({ updateCheckMinutes })}
              dropdownMinWidth={380}
            />
          </div>
        </div>
        <div className="mt-2 flex items-start gap-2 text-[9px] leading-4 text-zinc-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          {t('updates.signatureNotice')}
        </div>
      </section>
    </div>
  );
}
