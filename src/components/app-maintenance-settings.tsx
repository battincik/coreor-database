'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, FileWarning, Loader2, ShieldCheck } from 'lucide-react';
import { useTrackedBusy } from '@/lib/useUpdateActivity';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import { useLanguage } from '@/context/LanguageContext';

export function AppMaintenanceSettings() {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [path, setPath] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useTrackedBusy();

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
    return () => { cancelled = true; };
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

  return (
    <section className="min-w-0 rounded-2xl border border-zinc-800 bg-black/20 p-3 sm:p-5">
      <div className="mb-4 flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
        </span>
        <div>
          <h3 className="text-xs font-semibold text-zinc-100">{t('updates.diagnosticsTitle')}</h3>
          <p className="mt-1 text-[9px] leading-4 text-zinc-600">{t('updates.diagnosticsDescription')}</p>
        </div>
      </div>
      <div className="grid min-h-16 min-w-0 items-center gap-3 border-b border-zinc-800/70 py-3 xl:grid-cols-[minmax(180px,.8fr)_minmax(0,1.4fr)]">
        <div>
          <div className="text-[11px] font-medium text-zinc-200">{t('updates.reporting')}</div>
          <div className="mt-1 text-[9px] leading-4 text-zinc-600">{t('updates.reportingDescription')}</div>
        </div>
        <div className="min-w-0">
          {enabled === null
            ? <div className="flex items-center gap-2 text-[9px] text-zinc-600"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('common.loading')}</div>
            : <CoreorSwitch
                checked={enabled}
                disabled={saving}
                onCheckedChange={value => void toggle(value)}
                label={t('updates.reporting')}
              />}
        </div>
      </div>
      <div className="grid min-h-16 min-w-0 items-center gap-3 py-3 xl:grid-cols-[minmax(180px,.8fr)_minmax(0,1.4fr)]">
        <div>
          <div className="text-[11px] font-medium text-zinc-200">{t('updates.localLog')}</div>
          <div className="mt-1 text-[9px] leading-4 text-zinc-600">{t('updates.localLogDescription')}</div>
        </div>
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
          <div className="flex items-center gap-2 text-[9px] text-zinc-500">
            <FileWarning className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
            <span className="break-all font-mono">{path || '—'}</span>
          </div>
        </div>
      </div>
      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 py-2 text-[9px] leading-4 text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('updates.settingsError')}
        </div>
      )}
    </section>
  );
}
