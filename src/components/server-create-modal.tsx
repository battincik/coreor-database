'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronRight, Database, Server, Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
}

interface ServerCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (server: Omit<DatabaseServerConfig, 'id'>) => void | Promise<void>;
}

const ENGINE_OPTIONS: Array<{
  value: DatabaseEngine;
  label: string;
  description: string;
  versions: Array<{ value: string; label: string }>;
}> = [
  {
    value: 'mysql',
    label: 'MySQL',
    description: 'MySQL protokolü',
    versions: [
      { value: '9.6', label: 'MySQL 9.6 — Innovation' },
      { value: '8.4', label: 'MySQL 8.4 — LTS (Önerilen)' },
      { value: '8.0', label: 'MySQL 8.0' },
      { value: '5.7', label: 'MySQL 5.7 — Eski sürüm' }
    ]
  },
  {
    value: 'mariadb',
    label: 'MariaDB',
    description: 'MySQL uyumlu protokol',
    versions: [
      { value: '12.3', label: 'MariaDB 12.3 — LTS (Önerilen)' },
      { value: '11.8', label: 'MariaDB 11.8 — LTS' },
      { value: '11.4', label: 'MariaDB 11.4 — LTS' },
      { value: '10.11', label: 'MariaDB 10.11 — LTS' }
    ]
  }
];

const DEFAULT_VALUES: ServerCreateModalValues = {
  name: '',
  databaseType: 'mysql',
  version: '8.4',
  host: '',
  port: '3306',
  username: '',
  password: '',
  databaseName: '',
  sslMode: 'required'
};

const INPUT_CLASS = 'h-9 border-white/10 bg-zinc-950/70 px-3 text-xs text-white placeholder:text-zinc-600';
const LABEL_CLASS = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500';

export function ServerCreateModal({ open, onClose, onSubmit }: ServerCreateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<ServerCreateModalValues>(DEFAULT_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setValues(DEFAULT_VALUES);
      setSubmitting(false);
      setTesting(false);
      setError(null);
      setTestResult(null);
    }
  }, [open]);

  const selectedEngine = useMemo(
    () => ENGINE_OPTIONS.find(option => option.value === values.databaseType) ?? ENGINE_OPTIONS[0],
    [values.databaseType]
  );

  const updateValue = <K extends keyof ServerCreateModalValues>(key: K, value: ServerCreateModalValues[K]) => {
    setValues(previous => ({ ...previous, [key]: value }));
    setError(null);
    setTestResult(null);
  };

  const createServerPayload = (): Omit<DatabaseServerConfig, 'id'> => {
    const normalizedPort = Number(values.port || 3306);

    return {
      name: values.name.trim(),
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
    };
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);

    try {
      const result = await testDatabaseConnection({ id: 'connection-test', ...createServerPayload() });
      const version = result.connection?.version || 'Sürüm okunamadı';
      setTestResult(`Bağlantı başarılı — ${version}`);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Bağlantı testi başarısız oldu.');
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit(createServerPayload());
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <button type="button" aria-label="Kapat" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">
              <Shield className="h-3 w-3" />
              Şifreli tarayıcı kasası
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-white">{selectedEngine.label} sunucusu ekle</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">
              Profil IndexedDB içinde AES-256-GCM ile şifrelenir. Bağlantılar oturum doğrulamalı Next.js API üzerinden sunucu tarafında açılır.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full text-zinc-300" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1.12fr_0.88fr] lg:overflow-hidden">
          <div className="min-h-0 space-y-3 p-4 lg:overflow-y-auto">
            <Card className="border-white/10 bg-white/[0.025] shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-white">
                  <Server className="h-3.5 w-3.5 text-emerald-400" />
                  Bağlantı bilgileri
                </CardTitle>
                <CardDescription className="text-[11px] leading-4">
                  Parola yalnızca API isteği sırasında çözülür; Next.js sunucusunda kalıcı tutulmaz.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 pt-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={LABEL_CLASS}>Sunucu adı</label>
                  <Input value={values.name} onChange={event => updateValue('name', event.target.value)} placeholder="Üretim MySQL" className={INPUT_CLASS} required />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Host</label>
                  <Input value={values.host} onChange={event => updateValue('host', event.target.value)} placeholder="10.0.0.15 veya db.example.com" className={INPUT_CLASS} required />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Port</label>
                  <Input value={values.port} onChange={event => updateValue('port', event.target.value)} inputMode="numeric" placeholder="3306" className={INPUT_CLASS} required />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Kullanıcı adı</label>
                  <Input value={values.username} onChange={event => updateValue('username', event.target.value)} autoComplete="off" placeholder="coreor_client" className={INPUT_CLASS} required />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Parola</label>
                  <Input value={values.password} onChange={event => updateValue('password', event.target.value)} type="password" autoComplete="new-password" placeholder="••••••••" className={INPUT_CLASS} required />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Varsayılan veritabanı</label>
                  <Input value={values.databaseName} onChange={event => updateValue('databaseName', event.target.value)} placeholder="app_database" className={INPUT_CLASS} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>{selectedEngine.label} TLS</label>
                  <select value={values.sslMode} onChange={event => updateValue('sslMode', event.target.value as DatabaseSslMode)} className={`${INPUT_CLASS} w-full rounded-md`}>
                    <option value="required">TLS + sertifika doğrula</option>
                    <option value="preferred">TLS kullan, doğrulamayı esnet</option>
                    <option value="disabled">TLS kapalı</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] leading-4 text-red-300">{error}</div>}
            {testResult && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {testResult}
              </div>
            )}
          </div>

          <div className="min-h-0 space-y-3 border-t border-white/10 bg-white/[0.015] p-4 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <Card className="border-white/10 bg-zinc-950/60 shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-white">
                  <Database className="h-3.5 w-3.5 text-fuchsia-400" />
                  Veritabanı motoru
                </CardTitle>
                <CardDescription className="text-[11px]">MySQL ve MariaDB aynı sunucu tarafı sürücü üzerinden desteklenir.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5 p-4 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  {ENGINE_OPTIONS.map(option => {
                    const selected = values.databaseType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          updateValue('databaseType', option.value);
                          updateValue('version', option.versions.find(version => version.label.includes('Önerilen'))?.value ?? option.versions[0].value);
                        }}
                        className={`rounded-xl border px-3 py-2.5 text-left transition ${selected ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.05]'}`}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                          <ChevronRight className={`h-3.5 w-3.5 ${selected ? 'text-emerald-400' : 'text-zinc-600'}`} />
                          {option.label}
                        </span>
                        <span className="mt-1 block text-[10px] text-zinc-500">{option.description}</span>
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className={LABEL_CLASS}>Sunucu sürümü</label>
                  <select value={values.version} onChange={event => updateValue('version', event.target.value)} className={`${INPUT_CLASS} w-full rounded-md`}>
                    {selectedEngine.versions.map(version => (
                      <option key={version.value} value={version.value}>{version.label}</option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[10px] leading-4 text-zinc-600">Sürüm seçimi profil bilgisidir; gerçek sürüm bağlantı testinde doğrulanır.</p>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-blue-100">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold"><Shield className="h-3.5 w-3.5" />Sunucu güvenliği</div>
              <p className="text-[10px] leading-4 text-blue-100/70">
                Root kullanmayın. Özel ağ hostlarını Next.js sunucusundaki DATABASE_ALLOWED_HOSTS listesine, farklı portları DATABASE_ALLOWED_PORTS listesine ekleyin.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-9 text-xs" disabled={testing || submitting} onClick={handleTest}>
                {testing ? 'Test ediliyor...' : 'Bağlantıyı test et'}
              </Button>
              <Button type="submit" className="h-9 text-xs" disabled={submitting || testing}>
                {submitting ? 'Kaydediliyor...' : 'Güvenli kasaya kaydet'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
