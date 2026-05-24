'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Database, Server, Shield, Globe, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatabaseServerConfig } from 'types';
import { DEFAULT_DATABASE_API_BASE } from '@/lib/databaseApi';

export interface ServerCreateModalValues {
  name: string;
  databaseType: 'mysql' | 'mariadb' | 'postgresql';
  version: string;
  host: string;
  port: string;
  username: string;
  password: string;
  databaseName: string;
  visibleTo: string;
}

interface ServerCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (server: Omit<DatabaseServerConfig, 'id'>) => void;
}

const DEFAULT_VALUES: ServerCreateModalValues = {
  name: '',
  databaseType: 'mysql',
  version: '8.0',
  host: '',
  port: '3306',
  username: '',
  password: '',
  databaseName: '',
  visibleTo: ''
};

const ENGINE_OPTIONS: Array<{
  value: ServerCreateModalValues['databaseType'];
  label: string;
  description: string;
  versions: string[];
}> = [
  {
    value: 'mysql',
    label: 'MySQL',
    description: 'Varsayılan destek',
    versions: ['8.0', '5.7', '5.6']
  },
  {
    value: 'mariadb',
    label: 'MariaDB',
    description: 'Yakında',
    versions: ['11.4', '11.2', '10.11']
  },
  {
    value: 'postgresql',
    label: 'PostgreSQL',
    description: 'Yakında',
    versions: ['16', '15', '14']
  }
];

export function ServerCreateModal({ open, onClose, onSubmit }: ServerCreateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<ServerCreateModalValues>(DEFAULT_VALUES);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setValues(DEFAULT_VALUES);
    }
  }, [open]);

  const selectedEngine = useMemo(() => ENGINE_OPTIONS.find(option => option.value === values.databaseType) ?? ENGINE_OPTIONS[0], [values.databaseType]);

  const updateValue = <K extends keyof ServerCreateModalValues>(key: K, value: ServerCreateModalValues[K]) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const visibleTo = values.visibleTo
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

    const normalizedHost = values.host.trim();
    const normalizedPort = Number(values.port || 3306);

    onSubmit({
      name: values.name.trim(),
      baseUrl: DEFAULT_DATABASE_API_BASE,
      databaseType: values.databaseType,
      version: values.version,
      host: normalizedHost,
      port: Number.isNaN(normalizedPort) ? 3306 : normalizedPort,
      username: values.username.trim(),
      password: values.password,
      databaseName: values.databaseName.trim(),
      visibleTo
    });

    onClose();
  };

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" aria-label="Kapat" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 shadow-2xl shadow-black/50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.16),transparent_30%),radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_55%)]" />
        <div className="relative flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              <Database className="h-3.5 w-3.5" />
              Sunucu Ekle
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Yeni veritabanı sunucusu oluştur</h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">MySQL ile başlayabilirsin. Aynı form ileride MariaDB ve PostgreSQL profilleri için de kullanılacak şekilde hazırlandı.</p>
          </div>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="relative grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6 px-6 py-6">
            <Card className="border-white/10 bg-white/[0.03] shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Server className="h-4 w-4 text-emerald-400" />
                  Bağlantı Bilgileri
                </CardTitle>
                <CardDescription>Sunucunun teknik bağlantı detayları.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Sunucu Adı</label>
                  <Input value={values.name} onChange={e => updateValue('name', e.target.value)} placeholder="Örn: Üretim MySQL" className="h-11 border-white/10 bg-zinc-950/60 text-white placeholder:text-zinc-500" required />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Host</label>
                  <Input value={values.host} onChange={e => updateValue('host', e.target.value)} placeholder="127.0.0.1" className="h-11 border-white/10 bg-zinc-950/60 text-white placeholder:text-zinc-500" required />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Port</label>
                  <Input value={values.port} onChange={e => updateValue('port', e.target.value)} placeholder="3306" inputMode="numeric" className="h-11 border-white/10 bg-zinc-950/60 text-white placeholder:text-zinc-500" required />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Kullanıcı Adı</label>
                  <Input value={values.username} onChange={e => updateValue('username', e.target.value)} placeholder="root" className="h-11 border-white/10 bg-zinc-950/60 text-white placeholder:text-zinc-500" required />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Şifre</label>
                  <Input value={values.password} onChange={e => updateValue('password', e.target.value)} type="password" placeholder="••••••••" className="h-11 border-white/10 bg-zinc-950/60 text-white placeholder:text-zinc-500" required />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Varsayılan Veritabanı</label>
                  <Input value={values.databaseName} onChange={e => updateValue('databaseName', e.target.value)} placeholder="Örn: app_database" className="h-11 border-white/10 bg-zinc-950/60 text-white placeholder:text-zinc-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03] shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Shield className="h-4 w-4 text-blue-400" />
                  Erişim ve Paylaşım
                </CardTitle>
                <CardDescription>Kimlerin görebileceğini ve ileride nasıl paylaşılacağını belirle.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Görünür Kişiler</label>
                  <Input value={values.visibleTo} onChange={e => updateValue('visibleTo', e.target.value)} placeholder="userId, email, organizationId" className="h-11 border-white/10 bg-zinc-950/60 text-white placeholder:text-zinc-500" />
                  <p className="mt-2 text-xs text-zinc-500">Virgülle ayır. Şimdilik boş bırakabilirsin.</p>
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-zinc-950/60 p-4 text-sm text-zinc-300">
                  Bu alanlar arka uçta <span className="text-white">user_databases</span> tablosuna yazılacak. Şu an MySQL aktif, diğer motorlar için aynı formu genişleteceğiz.
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 border-t border-white/10 bg-white/[0.02] px-6 py-6 lg:border-l lg:border-t-0">
            <Card className="border-white/10 bg-zinc-950/50 shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Globe className="h-4 w-4 text-fuchsia-400" />
                  Motor Seçimi
                </CardTitle>
                <CardDescription>Şimdilik MySQL açık, diğerleri yakında geliyor.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  {ENGINE_OPTIONS.map(option => {
                    const selected = values.databaseType === option.value;
                    const disabled = option.value !== 'mysql';

                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          updateValue('databaseType', option.value);
                          updateValue('version', option.versions[0]);
                        }}
                        className={`flex items-start justify-between rounded-2xl border px-4 py-4 text-left transition-all ${selected ? 'border-emerald-400/60 bg-emerald-500/10 ring-1 ring-emerald-400/30' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'} ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
                      >
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-white">
                            <ChevronRight className={`h-4 w-4 transition-transform ${selected ? 'translate-x-0.5 text-emerald-400' : 'text-zinc-500'}`} />
                            {option.label}
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">{option.description}</p>
                        </div>
                        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300">{option.value === 'mysql' ? 'Aktif' : 'Yakında'}</span>
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">Sürüm</label>
                  <select value={values.version} onChange={e => updateValue('version', e.target.value)} className="h-11 w-full rounded-md border border-white/10 bg-zinc-950/60 px-3 text-sm text-white outline-none transition-colors focus:border-emerald-400/60" disabled={values.databaseType !== 'mysql'}>
                    {selectedEngine.versions.map(version => (
                      <option key={version} value={version} className="bg-zinc-950">
                        {values.databaseType === 'mysql' ? `MySQL ${version}` : version}
                      </option>
                    ))}
                  </select>
                  {values.databaseType !== 'mysql' && <p className="mt-2 text-xs text-zinc-500">Sürüm seçimi bu motor için henüz etkin değil.</p>}
                </div>
              </CardContent>
            </Card>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 via-transparent to-cyan-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Hazır Şablon</p>
              <p className="mt-2 text-sm text-zinc-300">Bu modal, ileride REST API üzerinden sunucu kaydı oluşturmak için doğrudan kullanılabilir.</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/10" onClick={onClose}>
                Vazgeç
              </Button>
              <Button type="submit" className="bg-emerald-500 text-white hover:bg-emerald-400">
                Sunucuyu Kaydet
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
