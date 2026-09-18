'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Network,
  Server,
  Shield,
  ShieldCheck,
  Sparkles,
  UserRound,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import type { DatabaseEngine, DatabaseServerConfig, DatabaseSslMode } from 'types';
import { testDatabaseConnection } from '@/lib/databaseApi';
import { DATABASE_ENGINES, databaseEngineDefinition } from '@/lib/databaseEngines';
import { useOrganizations } from '@/lib/organizationStore';
import { getAppPreferences } from '@/lib/appPreferences';

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
  organizationId: string;
  readOnly: boolean;
}

interface ServerCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (server: Omit<DatabaseServerConfig, 'id'>) => void | Promise<void>;
  initialServer?: DatabaseServerConfig | null;
  onUpdate?: (server: DatabaseServerConfig) => void | Promise<void>;
}

const TLS_OPTIONS: SearchSelectOption<DatabaseSslMode>[] = [
  { value: 'required', label: 'TLS zorunlu', description: 'Şifreli bağlantı ve sertifika doğrulaması.', badge: 'Sıkı', keywords: ['güvenli', 'ssl', 'sertifika'] },
  { value: 'preferred', label: 'TLS tercih et', description: 'Mümkünse TLS; uyumsuz sunucuda bağlantıyı sürdürür.', badge: 'Önerilen', keywords: ['preferred', 'uyumluluk'] },
  { value: 'disabled', label: 'TLS kapalı', description: 'Yalnızca güvenilir özel ağlarda kullanın.', badge: 'Riskli', keywords: ['kapalı', 'plain'] }
];

const TIMEOUT_OPTIONS: SearchSelectOption[] = [
  { value: '5000', label: '5 saniye', description: 'Yerel ağ ve hızlı sunucular', badge: 'Hızlı' },
  { value: '10000', label: '10 saniye', description: 'Çoğu yerel bağlantı için dengeli' },
  { value: '20000', label: '20 saniye', description: 'VPN ve internet bağlantıları', badge: 'Varsayılan' },
  { value: '30000', label: '30 saniye', description: 'Yavaş veya yoğun sunucular' },
  { value: '60000', label: '60 saniye', description: 'Yüksek gecikmeli bağlantılar', badge: 'Uzun' }
];

const DEFAULT_ENGINE = databaseEngineDefinition('mysql');
const DEFAULT_VALUES: ServerCreateModalValues = {
  name: '', databaseType: 'mysql', version: DEFAULT_ENGINE.defaultVersion, host: '',
  port: String(DEFAULT_ENGINE.defaultPort), username: '', password: '', databaseName: '',
  sslMode: 'preferred', connectionTimeoutMs: '20000', organizationId: '', readOnly: false
};

const INPUT_CLASS = 'h-10 rounded-xl border-white/10 bg-zinc-950/70 px-3 text-xs text-white placeholder:text-zinc-700 focus-visible:ring-cyan-500/25';
const LABEL_CLASS = 'mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600';

function valuesFromServer(server?: DatabaseServerConfig | null): ServerCreateModalValues {
  if (!server) return { ...DEFAULT_VALUES, readOnly: getAppPreferences().defaultReadOnlyConnections };
  const definition = databaseEngineDefinition(server.databaseType);
  return {
    name: server.name || '', databaseType: server.databaseType || 'mysql',
    version: server.version || definition.defaultVersion, host: server.host || '',
    port: String(server.port || definition.defaultPort), username: server.username || '',
    password: server.password || '', databaseName: server.databaseName || '',
    sslMode: server.sslMode || 'preferred', connectionTimeoutMs: String(server.connectionTimeoutMs || 20000),
    organizationId: server.organizationId || '', readOnly: Boolean(server.readOnly)
  };
}

function FormSection({ icon: Icon, title, description, children, className = '' }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`min-w-0 rounded-2xl border border-white/10 bg-white/[0.022] p-4 sm:p-5 ${className}`}>
    <div className="mb-4 flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-black/25 text-cyan-300"><Icon className="h-4 w-4" /></div><div className="min-w-0"><h3 className="text-xs font-semibold text-zinc-100">{title}</h3><p className="mt-1 text-[9px] leading-4 text-zinc-600">{description}</p></div></div>
    {children}
  </section>;
}

function SummaryItem({ icon: Icon, label, value, mono = false }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; mono?: boolean }) {
  return <div className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-800 bg-black/20 px-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-500"><Icon className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className="block text-[8px] uppercase tracking-[0.12em] text-zinc-600">{label}</span><span className={`mt-1 block truncate text-[11px] font-medium text-zinc-200 ${mono ? 'font-mono' : ''}`} title={value}>{value}</span></span></div>;
}

export function ServerCreateModal({ open, onClose, onSubmit, initialServer, onUpdate }: ServerCreateModalProps) {
  const { organizations } = useOrganizations();
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<ServerCreateModalValues>(DEFAULT_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const isEditing = Boolean(initialServer);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) setValues(valuesFromServer(initialServer));
    setSubmitting(false); setTesting(false); setShowPassword(false); setError(null); setTestResult(null);
  }, [open, initialServer]);

  const selectedEngine = useMemo(() => databaseEngineDefinition(values.databaseType), [values.databaseType]);
  const engineOptions = useMemo<SearchSelectOption<DatabaseEngine>[]>(() => DATABASE_ENGINES.map(engine => ({
    value: engine.id, label: engine.label, description: engine.description,
    badge: engine.badge, keywords: [engine.family, String(engine.defaultPort), ...engine.versions]
  })), []);
  const versionOptions = useMemo<SearchSelectOption[]>(() => selectedEngine.versions.map((version, index) => ({
    value: version, label: `${selectedEngine.label} ${version}`,
    description: index === 0 ? 'En yeni desteklenen sürüm profili' : 'Uyumluluk profili',
    badge: index === 0 ? 'Yeni' : /(?:8\.4|11\.4|11\.8|16|17|2022|2025)/.test(version) ? 'LTS' : undefined,
    keywords: [selectedEngine.label, version]
  })), [selectedEngine]);
  const organizationOptions = useMemo<SearchSelectOption[]>(() => [
    { value: '', label: 'Kişisel çalışma alanı', description: 'Yalnızca bu kullanıcı hesabının bağlantı kasasında.', badge: 'Kişisel' },
    ...organizations.map(organization => ({ value: organization.id, label: organization.name, description: `${organization.members.length} üye • ${organization.databases.length} bağlı veritabanı`, badge: 'Organizasyon', keywords: [organization.slug, organization.description] }))
  ], [organizations]);

  const updateValue = <K extends keyof ServerCreateModalValues>(key: K, value: ServerCreateModalValues[K]) => {
    setValues(previous => ({ ...previous, [key]: value })); setError(null); setTestResult(null);
  };

  const chooseEngine = (engine: DatabaseEngine) => {
    const definition = databaseEngineDefinition(engine);
    setValues(previous => ({ ...previous, databaseType: engine, version: definition.defaultVersion, port: String(definition.defaultPort) }));
    setError(null); setTestResult(null);
  };

  const createServerPayload = (): Omit<DatabaseServerConfig, 'id'> => {
    const port = Number(values.port || selectedEngine.defaultPort);
    const timeout = Number(values.connectionTimeoutMs || 20000);
    return {
      name: values.name.trim(), databaseType: values.databaseType, version: values.version,
      host: values.host.trim(), port: Number.isFinite(port) ? port : selectedEngine.defaultPort,
      username: values.username.trim(), password: values.password, databaseName: values.databaseName.trim(),
      sslMode: values.sslMode, connectionTimeoutMs: Number.isFinite(timeout) ? Math.min(Math.max(timeout, 3000), 60000) : 20000,
      organizationId: values.organizationId || null, readOnly: values.readOnly,
      visibleTo: initialServer?.visibleTo || [], databases: initialServer?.databases || [],
      createdAt: initialServer?.createdAt, updatedAt: initialServer?.updatedAt
    };
  };

  const handleTest = async () => {
    setTesting(true); setError(null); setTestResult(null);
    try {
      const result = await testDatabaseConnection({ id: initialServer?.id || 'connection-test', ...createServerPayload() });
      setTestResult(`Bağlantı başarılı — ${result.connection?.version || 'Sürüm okunamadı'} — ${result.connection?.currentUser || values.username}`);
    } catch (testError) { setError(testError instanceof Error ? testError.message : 'Bağlantı testi başarısız oldu.'); }
    finally { setTesting(false); }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError(null);
    try {
      const payload = createServerPayload();
      if (initialServer && onUpdate) await onUpdate({ ...initialServer, ...payload, id: initialServer.id }); else await onSubmit(payload);
      onClose();
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Sunucu kaydedilemedi.'); }
    finally { setSubmitting(false); }
  };

  if (!mounted || !open) return null;
  const tlsLabel = TLS_OPTIONS.find(option => option.value === values.sslMode)?.label || values.sslMode;
  const timeoutLabel = TIMEOUT_OPTIONS.find(option => option.value === values.connectionTimeoutMs)?.label || `${Number(values.connectionTimeoutMs || 0) / 1000} saniye`;
  const organizationLabel = organizationOptions.find(option => option.value === values.organizationId)?.label || 'Kişisel çalışma alanı';

  return createPortal(<div className="fixed inset-0 z-[360] flex items-center justify-center p-2 sm:p-4">
    <button type="button" aria-label="Kapat" className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
    <div className="relative z-10 flex max-h-[calc(100dvh-16px)] w-[calc(100vw-16px)] max-w-[1240px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:max-h-[calc(100dvh-32px)] sm:w-[calc(100vw-32px)] sm:rounded-3xl">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 bg-gradient-to-r from-cyan-500/[0.06] via-transparent to-emerald-500/[0.04] px-4 py-4 sm:px-6"><div className="min-w-0"><div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-medium text-emerald-300"><Shield className="h-3 w-3" />Şifreli tarayıcı kasası</div><h2 className="truncate text-lg font-semibold tracking-tight text-white sm:text-xl">{isEditing ? `${initialServer?.name} bağlantısını düzenle` : 'Yeni veritabanı sunucusu'}</h2><p className="mt-1 max-w-3xl text-[10px] leading-4 text-zinc-500 sm:text-[11px] sm:leading-5">Sunucu hedefini, motorunu, organizasyon kapsamını ve bağlantı politikasını tek profilde yönetin.</p></div><Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full" onClick={onClose}><X className="h-4 w-4" /></Button></header>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 lg:p-6">
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_430px]">
            <FormSection icon={Server} title="Sunucu bilgileri" description="Profil, ağ hedefi ve bağlantı kullanıcısı tek grupta yönetilir."><div className="grid gap-4">
              <div><label className={LABEL_CLASS}>Sunucu adı</label><Input value={values.name} onChange={event => updateValue('name', event.target.value)} placeholder="Üretim PostgreSQL" className={INPUT_CLASS} required /></div>
              <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3 sm:grid-cols-[minmax(0,1fr)_140px]"><div className="min-w-0"><label className={LABEL_CLASS}>Host veya IP</label><Input value={values.host} onChange={event => updateValue('host', event.target.value)} placeholder="192.168.50.25" className={INPUT_CLASS} required /></div><div><label className={LABEL_CLASS}>Port</label><Input value={values.port} onChange={event => updateValue('port', event.target.value)} inputMode="numeric" className={INPUT_CLASS} required /></div></div>
              <div><label className={LABEL_CLASS}>Varsayılan veritabanı</label><Input value={values.databaseName} onChange={event => updateValue('databaseName', event.target.value)} placeholder="Boş bırakılırsa motorun varsayılan veritabanı" className={INPUT_CLASS} /></div>
              <div className="border-t border-zinc-800/80 pt-4"><div className="mb-3 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600"><UserRound className="h-3.5 w-3.5 text-cyan-400" />Kimlik doğrulama</div><div className="grid gap-3 sm:grid-cols-2"><div><label className={LABEL_CLASS}>Kullanıcı adı</label><Input value={values.username} onChange={event => updateValue('username', event.target.value)} autoComplete="off" placeholder="coreor_app" className={INPUT_CLASS} required /></div><div><label className={LABEL_CLASS}>Parola</label><div className="relative"><Input value={values.password} onChange={event => updateValue('password', event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" className={`${INPUT_CLASS} pr-10`} required /><button type="button" aria-label={showPassword ? 'Parolayı gizle' : 'Parolayı göster'} onClick={() => setShowPassword(previous => !previous)} className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300">{showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button></div></div></div></div>
              <div className="flex items-start gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3 text-[9px] leading-4 text-emerald-100"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />Parola uygulama sunucusunda kalıcı tutulmaz; yalnızca istek anında bu cihazdaki şifreli kasadan çözülür.</div>
            </div></FormSection>

            <div className="grid content-start gap-4">
              <FormSection icon={Database} title="Sunucu türü ve sürüm" description="Motoru seçtiğinizde port ve sürüm profili otomatik güncellenir."><div className="grid gap-3"><div><label className={LABEL_CLASS}>Veritabanı motoru</label><SearchSelect value={values.databaseType} options={engineOptions} onValueChange={chooseEngine} searchPlaceholder="MySQL, PostgreSQL, MSSQL…" dropdownMinWidth={500} dropdownMaxWidth={620} showDescriptionInTrigger /></div><div><label className={LABEL_CLASS}>Sürüm profili</label><SearchSelect value={values.version} options={versionOptions} onValueChange={version => updateValue('version', version)} searchPlaceholder="Sürüm ara…" dropdownMinWidth={460} dropdownMaxWidth={560} /></div><div className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.04] px-3 py-2.5"><div className="flex items-center justify-between"><span className="text-[8px] uppercase tracking-[0.12em] text-cyan-500">{selectedEngine.family} protokolü</span><span className="rounded-full border border-cyan-500/20 px-2 py-0.5 text-[8px] text-cyan-300">:{selectedEngine.defaultPort}</span></div><div className="mt-1 text-sm font-semibold text-cyan-100">{selectedEngine.label} {values.version}</div><div className="mt-1 text-[9px] leading-4 text-zinc-600">{selectedEngine.description}</div></div></div></FormSection>
              <FormSection icon={Building2} title="Çalışma alanı" description="Bağlantıyı kişisel kasada veya bir organizasyon kapsamında tutun."><SearchSelect value={values.organizationId} options={organizationOptions} onValueChange={organizationId => updateValue('organizationId', organizationId)} searchPlaceholder="Organizasyon ara…" dropdownMinWidth={460} dropdownMaxWidth={580} /></FormSection>
              <FormSection icon={Network} title="Bağlantı politikası" description="TLS, ağ bekleme süresi ve yazma yetkisi."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><div><label className={LABEL_CLASS}>TLS politikası</label><SearchSelect value={values.sslMode} options={TLS_OPTIONS} onValueChange={sslMode => updateValue('sslMode', sslMode)} searchPlaceholder="TLS seçeneği ara…" dropdownMinWidth={460} /></div><div><label className={LABEL_CLASS}>Zaman aşımı</label><SearchSelect value={values.connectionTimeoutMs} options={TIMEOUT_OPTIONS} onValueChange={connectionTimeoutMs => updateValue('connectionTimeoutMs', connectionTimeoutMs)} searchPlaceholder="Süre ara…" dropdownMinWidth={440} /></div></div><div className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-3"><CoreorSwitch checked={values.readOnly} onCheckedChange={readOnly => updateValue('readOnly', readOnly)} label="Salt-okunur profil" description="UPDATE, DELETE, INSERT, ALTER, DROP, TRUNCATE ve görsel veri değişikliklerini engeller." /></div></FormSection>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/15 p-3"><div className="mb-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Bağlantı özeti</div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6"><SummaryItem icon={Server} label="Profil" value={values.name || 'Adsız bağlantı'} /><SummaryItem icon={Network} label="Hedef" value={`${values.host || 'host'}:${values.port || selectedEngine.defaultPort}`} mono /><SummaryItem icon={Database} label="Tür ve sürüm" value={`${selectedEngine.label} ${values.version}`} /><SummaryItem icon={Building2} label="Çalışma alanı" value={organizationLabel} /><SummaryItem icon={Clock3} label="Politika" value={`${tlsLabel} • ${timeoutLabel}`} /><SummaryItem icon={LockKeyhole} label="Erişim" value={values.readOnly ? 'Salt okunur' : 'Okuma ve yazma'} /></div></div>
          {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[11px] text-red-300">{error}</div>}
          {testResult && <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[11px] text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />{testResult}</div>}
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-white/10 bg-zinc-950/96 px-4 py-3 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex min-w-0 items-center gap-2 text-[9px] text-zinc-600"><Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-400" /><span className="truncate">{selectedEngine.label} {values.version} • {values.host || 'host'}:{values.port || selectedEngine.defaultPort} • {values.readOnly ? 'READ ONLY' : 'READ/WRITE'} • {organizationLabel}</span></div><div className="flex shrink-0 items-center gap-2"><Button type="button" variant="outline" size="sm" className="h-9 flex-1 gap-1.5 sm:flex-none" onClick={handleTest} disabled={testing || submitting}>{testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />}Bağlantıyı test et</Button><Button type="submit" size="sm" className="h-9 flex-1 sm:flex-none" disabled={submitting || testing}>{submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{isEditing ? 'Değişiklikleri kaydet' : 'Sunucuyu ekle'}</Button></div></footer>
      </form>
    </div>
  </div>, document.body);
}
