'use client';

import { useModalEscape } from '@/lib/useModalEscape';
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
import { useLanguage } from '@/context/LanguageContext';

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

type Translate = (key: string, values?: Record<string, string | number>) => string;

function createTlsOptions(t: Translate): SearchSelectOption<DatabaseSslMode>[] {
  return [
    {
      value: 'required',
      label: t('server.tlsRequired'),
      description: t('server.tlsRequiredDescription'),
      badge: t('server.badgeStrict'),
      keywords: [t('server.keywordSecure'), 'ssl', t('server.keywordCertificate')]
    },
    {
      value: 'preferred',
      label: t('server.tlsPreferred'),
      description: t('server.tlsPreferredDescription'),
      badge: t('server.badgeRecommended'),
      keywords: ['preferred', t('server.keywordCompatibility')]
    },
    {
      value: 'disabled',
      label: t('server.tlsDisabled'),
      description: t('server.tlsDisabledDescription'),
      badge: t('server.badgeRisky'),
      keywords: [t('server.keywordDisabled'), 'plain']
    }
  ];
}

function createTimeoutOptions(t: Translate): SearchSelectOption[] {
  return [
    { value: '5000', label: t('server.timeoutSeconds', { seconds: 5 }), description: t('server.timeoutFastDescription'), badge: t('server.badgeFast') },
    { value: '10000', label: t('server.timeoutSeconds', { seconds: 10 }), description: t('server.timeoutBalancedDescription') },
    { value: '20000', label: t('server.timeoutSeconds', { seconds: 20 }), description: t('server.timeoutInternetDescription'), badge: t('common.default') },
    { value: '30000', label: t('server.timeoutSeconds', { seconds: 30 }), description: t('server.timeoutSlowDescription') },
    { value: '60000', label: t('server.timeoutSeconds', { seconds: 60 }), description: t('server.timeoutHighLatencyDescription'), badge: t('server.badgeLong') }
  ];
}

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
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<ServerCreateModalValues>(DEFAULT_VALUES);
  const [submitting, setSubmitting] = useState(false);
  useModalEscape(open, onClose, submitting);
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
  const tlsOptions = useMemo(() => createTlsOptions(t), [t]);
  const timeoutOptions = useMemo(() => createTimeoutOptions(t), [t]);
  const engineOptions = useMemo<SearchSelectOption<DatabaseEngine>[]>(() => DATABASE_ENGINES.map(engine => ({
    value: engine.id, label: engine.label, description: engine.description,
    badge: engine.badge, keywords: [engine.family, String(engine.defaultPort), ...engine.versions]
  })), []);
  const versionOptions = useMemo<SearchSelectOption[]>(() => selectedEngine.versions.map((version, index) => ({
    value: version, label: `${selectedEngine.label} ${version}`,
    description: index === 0 ? t('server.latestVersionProfile') : t('server.compatibilityProfile'),
    badge: index === 0 ? t('server.badgeNew') : /(?:8\.4|11\.4|11\.8|16|17|2022|2025)/.test(version) ? 'LTS' : undefined,
    keywords: [selectedEngine.label, version]
  })), [selectedEngine, t]);
  const organizationOptions = useMemo<SearchSelectOption[]>(() => [
    { value: '', label: t('server.personalWorkspace'), description: t('server.personalWorkspaceDescription'), badge: t('server.personal') },
    ...organizations.map(organization => ({ value: organization.id, label: organization.name, description: t('server.organizationSummary', { members: organization.members.length, databases: organization.databases.length }), badge: t('server.organization'), keywords: [organization.slug, organization.description] }))
  ], [organizations, t]);

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
      username: values.username.trim(), password: values.password || undefined, databaseName: values.databaseName.trim(),
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
      setTestResult(t('server.connectionSuccessDetail', { version: result.connection?.version || t('server.versionUnavailable'), user: result.connection?.currentUser || values.username }));
    } catch (testError) { setError(testError instanceof Error ? testError.message : t('server.connectionTestFailed')); }
    finally { setTesting(false); }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError(null);
    try {
      const payload = createServerPayload();
      if (initialServer && onUpdate) await onUpdate({ ...initialServer, ...payload, id: initialServer.id }); else await onSubmit(payload);
      onClose();
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : t('server.saveFailed')); }
    finally { setSubmitting(false); }
  };

  if (!mounted || !open) return null;
  const tlsLabel = tlsOptions.find(option => option.value === values.sslMode)?.label || values.sslMode;
  const timeoutLabel = timeoutOptions.find(option => option.value === values.connectionTimeoutMs)?.label || t('server.timeoutSeconds', { seconds: Number(values.connectionTimeoutMs || 0) / 1000 });
  const organizationLabel = organizationOptions.find(option => option.value === values.organizationId)?.label || t('server.personalWorkspace');

  return createPortal(<div className="fixed inset-0 z-[360] flex items-center justify-center p-1.5 sm:p-3">
    <button type="button" aria-label={t('common.close')} className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
    <div className="relative z-10 flex h-[calc(100dvh-12px)] max-h-[860px] w-[calc(100vw-12px)] max-w-[1240px] min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-gradient-to-r from-cyan-500/[0.06] via-transparent to-emerald-500/[0.04] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-medium text-emerald-300"><Shield className="h-2.5 w-2.5" />{t('server.localConnectionVault')}</span>
            <h2 className="truncate text-[15px] font-semibold tracking-tight text-white">{isEditing ? t('server.editNamed', { name: initialServer?.name || '' }) : t('server.new')}</h2>
          </div>
          <p className="mt-1 truncate text-[9px] text-zinc-600">{t('server.description')}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-lg" onClick={onClose}><X className="h-4 w-4" /></Button>
      </header>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="coreor-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <section className="mb-3 rounded-xl border border-cyan-500/15 bg-cyan-500/[0.025] p-3">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-500/15 bg-cyan-500/[0.05] text-cyan-300"><Database className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold text-zinc-200">{t('server.engineAndVersion')}</div><div className="text-[8px] text-zinc-600">{t('server.engineAutoConfig')}</div></div>
              <span className="hidden rounded-md border border-cyan-500/15 px-2 py-1 font-mono text-[8px] text-cyan-300 md:inline-flex">{selectedEngine.family} • :{selectedEngine.defaultPort}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)_minmax(180px,.72fr)]">
              <div className="min-w-0"><label className={LABEL_CLASS}>{t('server.engine')}</label><SearchSelect value={values.databaseType} options={engineOptions} onValueChange={chooseEngine} searchPlaceholder="MySQL, PostgreSQL, MSSQL…" dropdownMinWidth={420} dropdownMaxWidth={560} showDescriptionInTrigger /></div>
              <div className="min-w-0"><label className={LABEL_CLASS}>{t('server.version')}</label><SearchSelect value={values.version} options={versionOptions} onValueChange={version => updateValue('version', version)} searchPlaceholder={t('server.searchVersion')} dropdownMinWidth={380} dropdownMaxWidth={500} /></div>
              <div className="min-w-0"><label className={LABEL_CLASS}>{t('server.activeProfile')}</label><div className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950/70 px-3"><span className="truncate text-[10px] font-medium text-cyan-100">{selectedEngine.label} {values.version}</span><span className="shrink-0 font-mono text-[8px] text-zinc-600">:{values.port || selectedEngine.defaultPort}</span></div></div>
            </div>
          </section>

          <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.18fr)_minmax(300px,.82fr)]">
            <FormSection icon={Server} title={t('server.serverInformation')} description={t('server.serverInformationDescription')}>
              <div className="grid gap-3">
                <div><label className={LABEL_CLASS}>{t('server.name')}</label><Input value={values.name} onChange={event => updateValue('name', event.target.value)} placeholder={t('server.namePlaceholder')} className={INPUT_CLASS} required /></div>
                <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2 sm:grid-cols-[minmax(0,1fr)_126px]"><div className="min-w-0"><label className={LABEL_CLASS}>{t('server.host')}</label><Input value={values.host} onChange={event => updateValue('host', event.target.value)} placeholder="192.168.50.25" className={INPUT_CLASS} required /></div><div><label className={LABEL_CLASS}>{t('server.port')}</label><Input value={values.port} onChange={event => updateValue('port', event.target.value)} inputMode="numeric" className={INPUT_CLASS} required /></div></div>
                <div><label className={LABEL_CLASS}>{t('server.defaultDatabase')}</label><Input value={values.databaseName} onChange={event => updateValue('databaseName', event.target.value)} placeholder={t('server.defaultDatabasePlaceholder')} className={INPUT_CLASS} /></div>
                <div className="border-t border-zinc-800/80 pt-3"><div className="mb-2 flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.12em] text-zinc-600"><UserRound className="h-3 w-3 text-cyan-400" />{t('server.authentication')}</div><div className="grid gap-2 sm:grid-cols-2"><div><label className={LABEL_CLASS}>{t('server.username')}</label><Input value={values.username} onChange={event => updateValue('username', event.target.value)} autoComplete="off" placeholder="coreor_app" className={INPUT_CLASS} required /></div><div><label className={LABEL_CLASS}>{t('server.password')}</label><div className="relative"><Input value={values.password} onChange={event => updateValue('password', event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder={isEditing ? t('server.changePasswordPlaceholder') : undefined} className={`${INPUT_CLASS} pr-10`} required={!isEditing} /><button type="button" aria-label={showPassword ? t('server.hidePassword') : t('server.showPassword')} onClick={() => setShowPassword(previous => !previous)} className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300">{showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button></div></div></div></div>
                <div className="flex items-start gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-2.5 text-[8px] leading-4 text-emerald-100"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t('server.encryptedVaultDescription')}</div>
              </div>
            </FormSection>

            <div className="grid content-start gap-3">
              <FormSection icon={Building2} title={t('server.workspace')} description={t('server.workspaceDescription')}><SearchSelect value={values.organizationId} options={organizationOptions} onValueChange={organizationId => updateValue('organizationId', organizationId)} searchPlaceholder={t('server.searchOrganization')} dropdownMinWidth={380} dropdownMaxWidth={520} /></FormSection>
              <FormSection icon={Network} title={t('server.connectionPolicy')} description={t('server.connectionPolicyDescription')}>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><div><label className={LABEL_CLASS}>{t('server.tls')}</label><SearchSelect value={values.sslMode} options={tlsOptions} onValueChange={sslMode => updateValue('sslMode', sslMode)} searchPlaceholder={t('server.searchTls')} dropdownMinWidth={380} /></div><div><label className={LABEL_CLASS}>{t('server.timeout')}</label><SearchSelect value={values.connectionTimeoutMs} options={timeoutOptions} onValueChange={connectionTimeoutMs => updateValue('connectionTimeoutMs', connectionTimeoutMs)} searchPlaceholder={t('server.searchTimeout')} dropdownMinWidth={360} /></div></div>
                <div className="mt-2.5 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-2.5"><CoreorSwitch checked={values.readOnly} onCheckedChange={readOnly => updateValue('readOnly', readOnly)} label={t('server.readOnlyProfile')} description={t('server.readOnlyDescriptionShort')} /></div>
              </FormSection>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-zinc-800 bg-black/15 p-2.5"><div className="mb-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{t('server.connectionSummary')}</div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6"><SummaryItem icon={Server} label={t('server.profile')} value={values.name || t('server.unnamedConnection')} /><SummaryItem icon={Network} label={t('server.target')} value={`${values.host || 'host'}:${values.port || selectedEngine.defaultPort}`} mono /><SummaryItem icon={Database} label={t('server.typeAndVersion')} value={`${selectedEngine.label} ${values.version}`} /><SummaryItem icon={Building2} label={t('server.workspace')} value={organizationLabel} /><SummaryItem icon={Clock3} label={t('server.policy')} value={`${tlsLabel} • ${timeoutLabel}`} /><SummaryItem icon={LockKeyhole} label={t('server.access')} value={values.readOnly ? t('server.readOnlyAccess') : t('server.readWriteAccess')} /></div></div>
          {error && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">{error}</div>}
          {testResult && <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />{testResult}</div>}
        </div>

        <footer className="z-10 flex shrink-0 flex-col gap-2 border-t border-white/10 bg-zinc-950 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex min-w-0 items-center gap-2 text-[8px] text-zinc-600"><Sparkles className="h-3 w-3 shrink-0 text-cyan-400" /><span className="truncate">{selectedEngine.label} {values.version} • {values.host || 'host'}:{values.port || selectedEngine.defaultPort} • {values.readOnly ? 'READ ONLY' : 'READ/WRITE'} • {organizationLabel}</span></div>
          <div className="flex shrink-0 items-center gap-2"><Button type="button" variant="outline" size="sm" className="h-8 flex-1 gap-1.5 px-3 text-[9px] sm:flex-none" onClick={handleTest} disabled={testing || submitting}>{testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />}{t('server.testConnection')}</Button><Button type="submit" size="sm" className="h-8 flex-1 px-3 text-[9px] sm:flex-none" disabled={submitting || testing}>{submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{isEditing ? t('server.saveChanges') : t('server.addServer')}</Button></div>
        </footer>
      </form>
    </div>
  </div>, document.body);
}
