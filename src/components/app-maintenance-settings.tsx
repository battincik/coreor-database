'use client';

import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, CheckCircle2, Clock3, Download, FileWarning, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useTrackedBusy } from '@/lib/useUpdateActivity';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import { Button } from '@/components/ui/button';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { useLanguage } from '@/context/LanguageContext';
import { useAppPreferences } from '@/lib/appPreferences';
import { checkForUpdates, installUpdate, useAppUpdater } from '@/lib/appUpdater';

function SettingsSection({
  icon: Icon,
  title,
  description,
  children
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-zinc-800 bg-black/20 p-3 sm:p-5">
      <div className="mb-4 flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950">
          <Icon className="h-4 w-4 text-cyan-400" />
        </span>
        <div>
          <h3 className="text-xs font-semibold text-zinc-100">{title}</h3>
          <p className="mt-1 text-[9px] leading-4 text-zinc-600">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SettingsRow({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-16 min-w-0 items-center gap-3 border-b border-zinc-800/70 py-3 last:border-0 xl:grid-cols-[minmax(180px,.8fr)_minmax(0,1.4fr)]">
      <div>
        <div className="text-[11px] font-medium text-zinc-200">{title}</div>
        <div className="mt-1 text-[9px] leading-4 text-zinc-600">{description}</div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function AppMaintenanceSettings() {
  const { t } = useLanguage();
  const { preferences, setPreferences } = useAppPreferences();
  const update = useAppUpdater();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [path, setPath] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useTrackedBusy();

  const intervalOptions = useMemo<SearchSelectOption<number>[]>(() =>
    [15, 30, 60, 120, 240].map(minutes => ({
      value: minutes,
      label: t('updates.minutes', { count: minutes }),
      description: minutes === 60 ? t('updates.intervalRecommended') : undefined,
      badge: minutes === 60 ? t('common.default') : undefined
    })), [t]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      invoke<{ remoteEnabled: boolean }>('read_diagnostic_settings'),
      invoke<string>('error_log_path')
    ])
      .then(([settings, log]) => {
        if (!cancelled) {
          setEnabled(settings.remoteEnabled);
          setPath(log);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (value: boolean) => {
    setSaving(true);
    setError(false);
    try {
      await invoke('set_error_reporting', { enabled: value });
      setEnabled(value);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const updateBusy = ['checking', 'downloading', 'verifying', 'installing'].includes(update.phase);
  const statusTone =
    update.phase === 'error'
      ? 'border-red-500/20 bg-red-500/[0.05] text-red-300'
      : update.phase === 'available'
        ? 'border-cyan-500/20 bg-cyan-500/[0.05] text-cyan-200'
        : update.phase === 'disabled'
          ? 'border-amber-500/20 bg-amber-500/[0.05] text-amber-200'
          : 'border-zinc-800 bg-zinc-950 text-zinc-300';

  return (
    <div className="space-y-4">
      <SettingsSection
        icon={ShieldCheck}
        title={t('updates.diagnosticsTitle')}
        description={t('updates.diagnosticsDescription')}
      >
        <SettingsRow title={t('updates.reporting')} description={t('updates.reportingDescription')}>
          <div className="flex min-h-9 items-center">
            {enabled === null
              ? <div className="flex items-center gap-2 text-[9px] text-zinc-600"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('common.loading')}</div>
              : <CoreorSwitch
                  checked={enabled}
                  disabled={saving}
                  onCheckedChange={value => void toggle(value)}
                  label={t('updates.reporting')}
                />}
          </div>
        </SettingsRow>
        <SettingsRow title={t('updates.localLog')} description={t('updates.localLogDescription')}>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
            <div className="flex items-center gap-2 text-[9px] text-zinc-500">
              <FileWarning className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
              <span className="break-all font-mono">{path || '—'}</span>
            </div>
          </div>
        </SettingsRow>
        {error && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 py-2 text-[9px] leading-4 text-red-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('updates.settingsError')}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        icon={RefreshCw}
        title={t('updates.updateTitle')}
        description={t('updates.updateDescription')}
      >
        <SettingsRow title={t('updates.interval')} description={t('updates.intervalDescription')}>
          <SearchSelect
            value={preferences.updateCheckMinutes}
            options={intervalOptions}
            onValueChange={updateCheckMinutes => setPreferences({ updateCheckMinutes })}
            dropdownMinWidth={420}
          />
        </SettingsRow>

        <SettingsRow title={t('updates.status')} description={t('updates.statusDescription')}>
          <div className={`rounded-xl border px-3 py-2 ${statusTone}`}>
            <div className="flex items-center gap-2 text-[10px] font-medium">
              {update.phase === 'checking' || update.phase === 'downloading' || update.phase === 'verifying' || update.phase === 'installing'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : update.phase === 'error' || update.phase === 'disabled'
                  ? <AlertTriangle className="h-3.5 w-3.5" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
              <span>{t(`updates.${update.phase}`)}</span>
              {update.version && <span className="ml-auto font-mono text-[9px] opacity-80">v{update.version}</span>}
            </div>
            {update.phase === 'disabled' && (
              <div className="mt-1.5 text-[8px] leading-4 opacity-75">
                {t(update.development ? 'updates.devDisabled' : 'updates.keyMissing')}
              </div>
            )}
            {update.error && (
              <div role="alert" className="mt-1.5 text-[8px] leading-4 text-red-300">
                {t(`updates.errors.${update.error}`)}
              </div>
            )}
          </div>
        </SettingsRow>

        <SettingsRow title={t('updates.actions')} description={t('updates.actionsDescription')}>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="w-full"
              disabled={updateBusy}
              onClick={() => void checkForUpdates()}
            >
              <Clock3 className="mr-2 h-3.5 w-3.5" />
              {t('updates.checkNow')}
            </Button>
            <Button
              className="w-full"
              disabled={!update.version || update.phase !== 'available'}
              onClick={() => void installUpdate()}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              {update.version ? t('updates.install', { version: update.version }) : t('updates.noUpdateAction')}
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
