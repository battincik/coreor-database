'use client';

import React, { useContext, useMemo, useState } from 'react';
import { Building2, Check, Database, MailPlus, Plus, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import type { OrganizationRole } from 'types';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useOrganizations } from '@/lib/organizationStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { CoreorSwitch } from '@/components/ui/coreor-switch';

const ROLE_OPTIONS: SearchSelectOption<OrganizationRole>[] = [
  { value: 'owner', label: 'Sahip', description: 'Organizasyonu silebilir ve bütün yetkileri yönetebilir.', badge: 'Tam yetki' },
  { value: 'admin', label: 'Yönetici', description: 'Üyeleri, sunucuları ve veritabanı bağlarını yönetir.' },
  { value: 'developer', label: 'Geliştirici', description: 'Şema ve veri işlemleri yapabilir.' },
  { value: 'analyst', label: 'Analist', description: 'Sorgu ve veri okuma araçlarını kullanabilir.' },
  { value: 'viewer', label: 'Görüntüleyici', description: 'Salt okunur katalog ve veri erişimi.' }
];

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `organization-${Date.now()}`;
}

export function OrganizationSettingsPanel({ accountEmail }: { accountEmail?: string | null }) {
  const { servers } = useContext(DatabaseContext)!;
  const organizationStore = useOrganizations();
  const { organizations } = organizationStore;
  const [selectedId, setSelectedId] = useState<string>(organizations[0]?.id || '');
  const [newOrganization, setNewOrganization] = useState({ name: '', description: '' });
  const [member, setMember] = useState<{ name: string; email: string; role: OrganizationRole }>({ name: '', email: '', role: 'developer' });
  const selected = organizations.find(item => item.id === selectedId) || organizations[0] || null;

  const organizationOptions = useMemo<SearchSelectOption[]>(() => organizations.map(organization => ({
    value: organization.id,
    label: organization.name,
    description: `${organization.members.length} üye • ${organization.databases.length} veritabanı`,
    badge: organization.ownerEmail === accountEmail ? 'Sahibi sizsiniz' : 'Üyesiniz',
    keywords: [organization.slug, organization.description]
  })), [organizations, accountEmail]);

  const databaseBindings = useMemo(() => servers.flatMap(server => (server.databases || []).map(database => ({
    serverId: server.id,
    serverName: server.name,
    databaseName: database.name,
    engine: server.databaseType || 'mysql'
  }))), [servers]);

  const create = () => {
    if (!newOrganization.name.trim()) return;
    const organization = organizationStore.createOrganization({ name: newOrganization.name, description: newOrganization.description, ownerEmail: accountEmail || '' });
    setSelectedId(organization.id); setNewOrganization({ name: '', description: '' });
  };

  return <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-800 bg-black/20 p-4"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-cyan-400" /><h3 className="text-xs font-semibold">Organizasyonlar</h3><span className="ml-auto rounded-full bg-zinc-900 px-2 py-0.5 text-[8px] text-zinc-500">{organizations.length}</span></div>{organizations.length ? <SearchSelect value={selected?.id || ''} options={organizationOptions} onValueChange={setSelectedId} className="mt-4" searchPlaceholder="Organizasyon ara…" dropdownMinWidth={520} dropdownMaxWidth={660} /> : <div className="mt-4 rounded-xl border border-dashed border-zinc-800 p-5 text-center text-[10px] leading-5 text-zinc-600">Henüz organizasyon yok. Kişisel ve ekip veritabanlarını ayırmak için ilk çalışma alanını oluşturun.</div>}</section>

      <section className="rounded-2xl border border-zinc-800 bg-black/20 p-4"><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-400" /><h3 className="text-xs font-semibold">Yeni organizasyon</h3></div><div className="mt-4 space-y-3"><Input value={newOrganization.name} onChange={event => setNewOrganization(previous => ({ ...previous, name: event.target.value }))} placeholder="Organizasyon adı" className="h-9" /><textarea value={newOrganization.description} onChange={event => setNewOrganization(previous => ({ ...previous, description: event.target.value }))} placeholder="Ekip, proje veya müşteri açıklaması" className="h-20 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-[10px] outline-none focus:border-cyan-500/50" /><Button className="w-full" size="sm" disabled={!newOrganization.name.trim()} onClick={create}><Building2 className="mr-1.5 h-3.5 w-3.5" />Organizasyon oluştur</Button></div></section>
    </div>

    {!selected ? <div className="flex min-h-96 items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-center"><div><Users className="mx-auto h-8 w-8 text-zinc-700" /><div className="mt-3 text-xs text-zinc-500">Yönetilecek organizasyon seçilmedi.</div></div></div> : <div className="space-y-4">
      <section className="rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.06] via-transparent to-purple-500/[0.04] p-5"><div className="flex flex-wrap items-start gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-lg font-semibold text-cyan-200">{selected.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><Input value={selected.name} onChange={event => organizationStore.updateOrganization(selected.id, { name: event.target.value })} className="h-9 max-w-md border-transparent bg-transparent px-0 text-base font-semibold focus-visible:ring-0" /><div className="font-mono text-[9px] text-zinc-600">/{selected.slug}</div><textarea value={selected.description} onChange={event => organizationStore.updateOrganization(selected.id, { description: event.target.value })} placeholder="Organizasyon açıklaması" className="mt-3 h-16 w-full max-w-2xl resize-none rounded-xl border border-zinc-800 bg-black/20 p-3 text-[10px] outline-none focus:border-cyan-500/40" /></div><Button variant="ghost" size="sm" className="text-red-400" onClick={() => { organizationStore.deleteOrganization(selected.id); setSelectedId(organizations.find(item => item.id !== selected.id)?.id || ''); }}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Sil</Button></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{[[Users, 'Üye', selected.members.length], [Database, 'Veritabanı', selected.databases.length], [ShieldCheck, 'Sahip', selected.ownerEmail || '—']].map(([Icon, label, value]) => <div key={String(label)} className="rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="flex items-center gap-2 text-[8px] uppercase tracking-wider text-zinc-600"><Icon className="h-3 w-3" />{label}</div><div className="mt-1 truncate text-[11px] font-medium text-zinc-200">{String(value)}</div></div>)}</div></section>

      <section className="rounded-2xl border border-zinc-800 bg-black/20 p-4"><div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-purple-400" /><div><h3 className="text-xs font-semibold">Üyeler ve roller</h3><p className="mt-0.5 text-[9px] text-zinc-600">Davet edilen kullanıcıların çalışma alanındaki rolünü belirleyin.</p></div></div><div className="mt-4 grid gap-2 lg:grid-cols-[minmax(130px,.6fr)_minmax(190px,1fr)_minmax(200px,.8fr)_auto]"><Input value={member.name} onChange={event => setMember(previous => ({ ...previous, name: event.target.value }))} className="h-10" placeholder="Ad" /><Input value={member.email} onChange={event => setMember(previous => ({ ...previous, email: event.target.value }))} className="h-10" placeholder="E-posta" /><SearchSelect value={member.role} options={ROLE_OPTIONS} onValueChange={role => setMember(previous => ({ ...previous, role }))} dropdownMinWidth={500} dropdownMaxWidth={620} /><Button className="h-10" disabled={!member.email.includes('@')} onClick={() => { organizationStore.addOrganizationMember(selected.id, member); setMember({ name: '', email: '', role: 'developer' }); }}><MailPlus className="mr-1.5 h-3.5 w-3.5" />Davet et</Button></div><div className="mt-4 space-y-2">{selected.members.map(item => <div key={item.id} className="grid items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 sm:grid-cols-[minmax(180px,1fr)_220px_100px_auto]"><div className="min-w-0"><div className="truncate text-[11px] font-medium">{item.name}</div><div className="truncate text-[9px] text-zinc-600">{item.email}</div></div><SearchSelect value={item.role} options={ROLE_OPTIONS} onValueChange={role => organizationStore.updateOrganizationMember(selected.id, item.id, { role })} dropdownMinWidth={500} dropdownMaxWidth={620} triggerClassName="min-h-9" showDescriptionInTrigger={false} /><span className={`rounded-full px-2 py-1 text-center text-[8px] ${item.status === 'active' ? 'bg-emerald-500/10 text-emerald-300' : item.status === 'invited' ? 'bg-amber-500/10 text-amber-300' : 'bg-red-500/10 text-red-300'}`}>{item.status === 'active' ? 'Aktif' : item.status === 'invited' ? 'Davet edildi' : 'Askıda'}</span><Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" disabled={item.role === 'owner'} onClick={() => organizationStore.removeOrganizationMember(selected.id, item.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div></section>

      <section className="rounded-2xl border border-zinc-800 bg-black/20 p-4"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-emerald-400" /><div><h3 className="text-xs font-semibold">Organizasyona bağlı veritabanları</h3><p className="mt-0.5 text-[9px] text-zinc-600">Bağlar erişim kapsamını ve ekip görünümünü belirler; parolalar yine kullanıcının şifreli kasasında kalır.</p></div></div><div className="mt-4 grid gap-2 md:grid-cols-2">{databaseBindings.map(binding => {
        const enabled = selected.databases.some(item => item.serverId === binding.serverId && item.databaseName === binding.databaseName);
        return <div key={`${binding.serverId}:${binding.databaseName}`} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-black/20"><Database className="h-4 w-4 text-emerald-400" /></span><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-medium">{binding.databaseName}</div><div className="truncate text-[8px] text-zinc-600">{binding.serverName} • {binding.engine}</div></div><CoreorSwitch checked={enabled} onCheckedChange={checked => organizationStore.setOrganizationDatabaseBinding(selected.id, { serverId: binding.serverId, databaseName: binding.databaseName }, checked)} ariaLabel={`${binding.databaseName} organizasyon bağı`} /></div>;
      })}{!databaseBindings.length && <div className="col-span-full rounded-xl border border-dashed border-zinc-800 p-5 text-center text-[10px] text-zinc-600">Önce bir sunucuya bağlanıp kataloğu yükleyin.</div>}</div></section>
    </div>}
  </div>;
}
