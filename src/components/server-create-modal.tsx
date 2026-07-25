'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Database, Globe, Server, Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DatabaseServerConfig, DatabaseSslMode } from 'types';
import { DEFAULT_DATABASE_CONNECTOR_URL } from '@/lib/databaseApi';

interface ServerCreateModalValues {
  name: string;
  connectorUrl: string;
  databaseType: 'mysql' | 'mariadb' | 'postgresql';
  version: string;
  host: string;
  port: string;
  username: string;
  password: string;
  databaseName: string;
  sslMode: DatabaseSslMode;
}

interface ServerCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (server: Omit<DatabaseServerConfig, 'id'>) => void | Promise<void>;
}

const DEFAULT_VALUES: ServerCreateModalValues = {
  name: '',
  connectorUrl: DEFAULT_DATABASE_CONNECTOR_URL,
  databaseType: 'mysql',
  version: '8.0',
  host: '',
  port: '3306',
  username: '',
  password: '',
  databaseName: '',
  sslMode: 'required'
};

const ENGINE_OPTIONS = [
  { value: 'mysql' as const, label: 'MySQL', versions: ['8.0', '5.7'], enabled: true },
  { value: 'mariadb' as const, label: 'MariaDB', versions: ['11.4', '10.11'], enabled: false },
  { value: 'postgresql' as const, label: 'PostgreSQL', versions: ['16', '15'], enabled: false }
];

export function ServerCreateModal({ open, onClose, onSubmit }: ServerCreateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<ServerCreateModalValues>(DEFAULT_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setValues(DEFAULT_VALUES);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const selectedEngine = useMemo(() => ENGINE_OPTIONS.find(option => option.value === values.databaseType) ?? ENGINE_OPTIONS[0], [values.databaseType]);

  const updateValue = <K extends keyof ServerCreateModalValues>(key: K, value: ServerCreateModalValues[K]) => {
    setValues(previous => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const normalizedPort = Number(values.port || 3306);
    const connectorUrl = values.connectorUrl.trim().replace(/\/+$/, '');

    try {
      await onSubmit({
        name: values.name.trim(),
        connectorUrl,
        baseUrl: connectorUrl,
        databaseType: values.databaseType,
        version: values.version,
        host: values.host.trim(),
        port: Number.isFinite(normalizedPort) ? normalizedPort : 3306,
        username: values.username.trim(),
        password: values.password,
        databaseName: values.databaseName.trim(),
        sslMode: values.sslMode,
        connectionTimeoutMs: 20_000,
        visibleTo: [],
        databases: []
      });

      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Sunucu kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button type="button" aria-label="Kapat" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 max-h-full w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              <Shield className="h-3.5 w-3.5" />
              Şifreli tarayıcı kasası
            </div>
            <h2 className="text-2xl font-semibold text-white">MySQL sunucusu ekle</h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">Bağlantı bilgileri AES-256-GCM ile şifrelenerek IndexedDB içinde aktif kullanıcı hesabına bağlı saklanır. Merkezi Coreor API&apos;sine gönderilmez.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="rounded-full text-white" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="grid lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-5 px-6 py-6">
            <Card className="border-white/10 bg-white/[0.03] shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  Tarayıcı connector
                </CardTitle>
                <CardDescription>Tarayıcı raw MySQL TCP bağlantısı açamadığı için her sunucuya yakın stateless HTTPS connector gerekir.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="block text-xs font-medium uppercase tracking-wide text-zinc-400">Connector URL</label>
                <Input
                  type="url"
                  value={values.connectorUrl}
                  onChange={event => updateValue('connectorUrl', event.target.value)}
                  placeholder="https://mysql-connector.example.com"
                  className="h-11 border-white/10 bg-zinc-950/70 text-white"
                  required
                />
                <p className="text-xs text-zinc-500">Üretimde HTTPS, geçerli sertifika ve yalnızca uygulama origin&apos;ine izin veren CORS kullan.</p>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03] shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Server className="h-4 w-4 text-emerald-400" />
                  MySQL bağlantısı
                </CardTitle>
                <CardDescription>Bu bilgiler connector isteği sırasında bellekte çözülür; connector tarafında kalıcı tutulmamalıdır.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Sunucu adı</label>
                  <Input value={values.name} onChange={event => updateValue('name', event.target.value)} placeholder="Üretim MySQL" className="h-11 border-white/10 bg-zinc-950/70 text-white" required />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Host</label>
                  <Input value={values.host} onChange={event => updateValue('host', event.target.value)} placeholder="10.0.0.15" className="h-11 border-white/10 bg-zinc-950/70 text-white" required />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Port</label>
                  <Input value={values.port} onChange={event => updateValue('port', event.target.value)} inputMode="numeric" placeholder="3306" className="h-11 border-white/10 bg-zinc-950/70 text-white" required />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Kullanıcı adı</label>
                  <Input value={values.username} onChange={event => updateValue('username', event.target.value)} autoComplete="off" placeholder="coreor_client" className="h-11 border-white/10 bg-zinc-950/70 text-white" required />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Parola</label>
                  <Input value={values.password} onChange={event => updateValue('password', event.target.value)} type="password" autoComplete="new-password" placeholder="••••••••" className="h-11 border-white/10 bg-zinc-950/70 text-white" required />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Varsayılan veritabanı</label>
                  <Input value={values.databaseName} onChange={event => updateValue('databaseName', event.target.value)} placeholder="app_database" className="h-11 border-white/10 bg-zinc-950/70 text-white" />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">MySQL TLS</label>
                  <select value={values.sslMode} onChange={event => updateValue('sslMode', event.target.value as DatabaseSslMode)} className="h-11 w-full rounded-md border border-white/10 bg-zinc-950/70 px-3 text-sm text-white">
                    <option value="required">Zorunlu</option>
                    <option value="preferred">Tercih et</option>
                    <option value="disabled">Kapalı</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
          </div>

          <div className="space-y-5 border-t border-white/10 bg-white/[0.02] px-6 py-6 lg:border-l lg:border-t-0">
            <Card className="border-white/10 bg-zinc-950/60 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Database className="h-4 w-4 text-fuchsia-400" />
                  Veritabanı motoru
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {ENGINE_OPTIONS.map(option => {
                  const selected = values.databaseType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!option.enabled}
                      onClick={() => {
                        updateValue('databaseType', option.value);
                        updateValue('version', option.versions[0]);
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${selected ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]'} ${option.enabled ? '' : 'cursor-not-allowed opacity-50'}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-white"><ChevronRight className="h-4 w-4" />{option.label}</span>
                      <span className="text-xs text-zinc-400">{option.enabled ? 'Aktif' : 'Yakında'}</span>
                    </button>
                  );
                })}

                <select value={values.version} onChange={event => updateValue('version', event.target.value)} className="h-11 w-full rounded-md border border-white/10 bg-zinc-950/70 px-3 text-sm text-white">
                  {selectedEngine.versions.map(version => <option key={version} value={version}>{selectedEngine.label} {version}</option>)}
                </select>
              </CardContent>
            </Card>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">
              <div className="mb-2 flex items-center gap-2 font-medium"><Shield className="h-4 w-4" />Güvenlik önerisi</div>
              <p className="text-xs leading-5 text-blue-100/75">Root hesabı kullanma. Yalnızca gereken şema ve işlemler için ayrı MySQL kullanıcısı oluştur; TLS zorunlu tut ve connector erişimini ağ/CORS katmanında sınırla.</p>
            </div>

            <Button type="submit" className="h-11 w-full" disabled={submitting}>
              {submitting ? 'Şifreleniyor ve kaydediliyor...' : 'Sunucuyu güvenli kasaya kaydet'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
