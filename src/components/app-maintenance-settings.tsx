'use client';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/LanguageContext';
import { useAppPreferences } from '@/lib/appPreferences';
import { checkForUpdates, installUpdate, useAppUpdater } from '@/lib/appUpdater';
export function AppMaintenanceSettings() {
  const { t } = useLanguage();
  const { preferences, setPreferences } = useAppPreferences();
  const update = useAppUpdater();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [path, setPath] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([invoke<{ remoteEnabled: boolean }>('read_diagnostic_settings'), invoke<string>('error_log_path')])
      .then(([settings, log]) => { if (!cancelled) { setEnabled(settings.remoteEnabled); setPath(log); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);
  const toggle = async (value: boolean) => {
    setSaving(true); setError(false);
    try { await invoke('set_error_reporting', { enabled: value }); setEnabled(value); }
    catch { setError(true); }
    finally { setSaving(false); }
  };
  return <section className="space-y-4 border border-border bg-background p-4">
    <h3 className="text-sm font-semibold">{t('updates.settingsTitle')}</h3>
    <div className="flex items-start justify-between gap-6"><div><p className="text-xs">{t('updates.reporting')}</p><p className="mt-1 text-xs text-muted-foreground">{t('updates.reportingDescription')}</p></div>
      {enabled !== null && <CoreorSwitch checked={enabled} disabled={saving} onCheckedChange={value => void toggle(value)} label={t('updates.reporting')} />}</div>
    <p className="break-all text-xs text-muted-foreground">error.log: {path || '—'}</p>
    <label className="flex items-center justify-between gap-4 text-xs">{t('updates.interval')}<select value={preferences.updateCheckMinutes} onChange={e => setPreferences({ updateCheckMinutes: Number(e.target.value) })} className="border border-border bg-background p-2">
      {[15, 30, 60, 120, 240].map(minutes => <option key={minutes} value={minutes}>{t('updates.minutes', { count: minutes })}</option>)}</select></label>
    <p className="text-xs text-muted-foreground">{t(`updates.${update.phase}`)}{update.version ? ` · ${update.version}` : ''}</p>
    {update.phase === 'disabled' && <p className="text-xs text-muted-foreground">{t(update.development ? 'updates.devDisabled' : 'updates.keyMissing')}</p>}
    {update.error && <p role="alert" className="text-xs text-red-400">{t(`updates.errors.${update.error}`)}</p>}
    {error && <p role="alert" className="text-xs text-red-400">{t('updates.settingsError')}</p>}
    <div className="flex gap-2"><Button variant="outline" size="sm" disabled={['checking', 'downloading', 'installing'].includes(update.phase)} onClick={() => void checkForUpdates()}>{t('updates.checkNow')}</Button>
      {update.version && <Button size="sm" disabled={update.phase !== 'available'} onClick={() => void installUpdate()}>{t('updates.install', { version: update.version })}</Button>}</div>
  </section>;
}
