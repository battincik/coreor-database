'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Database, Loader2, Server, Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DatabaseEngine, DatabaseServerConfig, DatabaseSslMode } from 'types';
import { testDatabaseConnection } from '@/lib/databaseApi';

interface ServerCreateModalValues {
  name: string;
  databaseType: DatabaseEngine;
  version: string;
  host: string;
  port: string;
  username: string;
  password: string;
  databaseName: string;
  sslMode: DatabaseSslMode;
  connectionTimeoutMs: string;
}

interface ServerCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (server: Omit<DatabaseServerConfig, 'id'>) => void | Promise<void>;
  initialServer?: DatabaseServerConfig | null;
  onUpdate?: (server: DatabaseServerConfig) => void | Promise<void>;
}

const ENGINE_OPTIONS: Array<{ value: DatabaseEngine; label: string; versions: string[] }> = [
  { value: 'mysql', label: 'MySQL', versions: ['9.6', '8.4', '8.0', '5.7'] },
  { value: 'mariadb', label: 'MariaDB', versions: ['12.3', '11.8', '11.4', '10.11'] }
];
const DEFAULT_VALUES: ServerCreateModalValues = { name: '', databaseType: 'mysql', version: '8.4', host: '', port: '3306', username: '', password: '', databaseName: '', sslMode: 'required', connectionTimeoutMs: '20000' };
const INPUT_CLASS = 'h-9 border-white/10 bg-zinc-950/70 px-3 text-xs text-white placeholder:text-zinc-600';
const LABEL_CLASS = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500';

function valuesFromServer(server?: DatabaseServerConfig | null): ServerCreateModalValues {
  if (!server) return DEFAULT_VALUES;
  return {
    name: server.name || '',
    databaseType: server.databaseType || 'mysql',
    version: server.version || (server.databaseType === 'mariadb' ? '12.3' : '8.4'),
    host: server.host || '',
    port: String(server.port || 3306),
    username: server.username || '',
    password: server.password || '',
    databaseName: server.databaseName || '',
    sslMode: server.sslMode || 'required',
    connectionTimeoutMs: String(server.connectionTimeoutMs || 20000)
  };
}

export function ServerCreateModal({ open, onClose, onSubmit, initialServer, onUpdate }: ServerCreateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<ServerCreateModalValues>(DEFAULT_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const isEditing = Boolean(initialServer);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) setValues(valuesFromServer(initialServer));
    setSubmitting(false); setTesting(false); setError(null); setTestResult(null);
  }, [open, initialServer]);

  const selectedEngine = useMemo(() => ENGINE_OPTIONS.find(option => option.value === values.databaseType) ?? ENGINE_OPTIONS[0], [values.databaseType]);
  const updateValue = <K extends keyof ServerCreateModalValues>(key: K, value: ServerCreateModalValues[K]) => {
    setValues(previous => ({ ...previous, [key]: value }));
    setError(null); setTestResult(null);
  };

  const createServerPayload = (): Omit<DatabaseServerConfig, 'id'> => {
    const port = Number(values.port || 3306);
    const timeout = Number(values.connectionTimeoutMs || 20000);
    return {
      name: values.name.trim(), databaseType: values.databaseType, version: values.version,
      host: values.host.trim(), port: Number.isFinite(port) ? port : 3306,
      username: values.username.trim(), password: values.password, databaseName: values.databaseName.trim(),
      sslMode: values.sslMode, connectionTimeoutMs: Number.isFinite(timeout) ? Math.min(Math.max(timeout, 3000), 60000) : 20000,
      visibleTo: initialServer?.visibleTo || [], databases: initialServer?.databases || [], createdAt: initialServer?.createdAt, updatedAt: initialServer?.updatedAt
    };
  };

  const handleTest = async () => {
    setTesting(true); setError(null); setTestResult(null);
    try {
      const result = await testDatabaseConnection({ id: initialServer?.id || 'connection-test', ...createServerPayload() });
      setTestResult(`Bağlantı başarılı — ${result.connection?.version || 'Sürüm okunamadı'} — ${result.connection?.currentUser || values.username}`);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Bağlantı testi başarısız oldu.');
    } finally { setTesting(false); }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError(null);
    try {
      const payload = createServerPayload();
      if (initialServer && onUpdate) await onUpdate({ ...initialServer, ...payload, id: initialServer.id });
      else await onSubmit(payload);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Sunucu kaydedilemedi.');
    } finally { setSubmitting(false); }
  };

  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[360] flex items-center justify-center p-3 sm:p-4">
      <button type="button" aria-label="Kapat" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4"><div><div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300"><Shield className="h-3 w-3" />Şifreli tarayıcı kasası</div><h2 className="text-lg font-semibold text-white">{isEditing ? `${initialServer?.name} bağlantısını düzenle` : `${selectedEngine.label} sunucusu ekle`}</h2><p className="mt-1 text-xs text-zinc-500">Profil bilgileri şifreli kasada tutulur; bağlantı yalnızca doğrulanmış API isteğinde açılır.</p></div><Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}><X className="h-4 w-4" /></Button></header>
        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 grid gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className={LABEL_CLASS}>Sunucu adı</label><Input value={values.name} onChange={event => updateValue('name', event.target.value)} placeholder="Üretim MySQL" className={INPUT_CLASS} required /></div>
            <div><label className={LABEL_CLASS}>Host</label><Input value={values.host} onChange={event => updateValue('host', event.target.value)} placeholder="192.168.50.25" className={INPUT_CLASS} required /></div>
            <div><label className={LABEL_CLASS}>Port</label><Input value={values.port} onChange={event => updateValue('port', event.target.value)} inputMode="numeric" className={INPUT_CLASS} required /></div>
            <div><label className={LABEL_CLASS}>Kullanıcı adı</label><Input value={values.username} onChange={event => updateValue('username', event.target.value)} autoComplete="off" className={INPUT_CLASS} required /></div>
            <div><label className={LABEL_CLASS}>Parola</label><Input value={values.password} onChange={event => updateValue('password', event.target.value)} type="password" autoComplete="new-password" className={INPUT_CLASS} required /></div>
            <div><label className={LABEL_CLASS}>Varsayılan veritabanı</label><Input value={values.databaseName} onChange={event => updateValue('databaseName', event.target.value)} placeholder="coreor_proxy" className={INPUT_CLASS} /></div>
            <div><label className={LABEL_CLASS}>Bağlantı zaman aşımı (ms)</label><Input value={values.connectionTimeoutMs} onChange={event => updateValue('connectionTimeoutMs', event.target.value)} inputMode="numeric" className={INPUT_CLASS} /></div>
          </div>
          <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-3">
            <div><label className={LABEL_CLASS}>Motor</label><select value={values.databaseType} onChange={event => { const engine = event.target.value as DatabaseEngine; updateValue('databaseType', engine); updateValue('version', engine === 'mariadb' ? '12.3' : '8.4'); }} className={`${INPUT_CLASS} w-full rounded-md`}>{ENGINE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div><label className={LABEL_CLASS}>Sürüm profili</label><select value={values.version} onChange={event => updateValue('version', event.target.value)} className={`${INPUT_CLASS} w-full rounded-md`}>{selectedEngine.versions.map(version => <option key={version} value={version}>{selectedEngine.label} {version}</option>)}</select></div>
            <div><label className={LABEL_CLASS}>TLS</label><select value={values.sslMode} onChange={event => updateValue('sslMode', event.target.value as DatabaseSslMode)} className={`${INPUT_CLASS} w-full rounded-md`}><option value="required">Sertifikayı doğrula</option><option value="preferred">Tercih et / esnek</option><option value="disabled">Kapalı</option></select></div>
          </div>
          {error && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</div>}
          {testResult && <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />{testResult}</div>}
          <footer className="mt-5 flex items-center justify-between border-t border-white/10 pt-4"><div className="flex items-center gap-2 text-[10px] text-zinc-600"><Database className="h-3.5 w-3.5" />MySQL / MariaDB</div><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleTest} disabled={testing || submitting}>{testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />}Bağlantıyı test et</Button><Button type="submit" size="sm" className="h-8" disabled={submitting || testing}>{submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{isEditing ? 'Değişiklikleri kaydet' : 'Sunucuyu ekle'}</Button></div></footer>
        </form>
      </div>
    </div>,
    document.body
  );
}
