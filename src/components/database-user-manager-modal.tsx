'use client';

import { useModalEscape } from '@/lib/useModalEscape';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, KeyRound, Loader2, Plus, RefreshCw, Save, Shield, Trash2, UserCog, Users, X } from 'lucide-react';
import type { DatabaseCatalogItem } from 'types';
import type { DatabaseAccountInfo, DatabasePrivilegeScope } from '@/lib/databaseWorkbenchTypes';
import { DATABASE_PRIVILEGES } from '@/lib/databaseWorkbenchTypes';
import {
  assignDatabaseRole,
  changeDatabasePrivileges,
  createDatabaseRole,
  dropDatabaseUser,
  getDatabaseUserGrants,
  listDatabaseUsers,
  saveDatabaseUser
} from '@/lib/databaseWorkbenchApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CoreorConfirmModal, type CoreorConfirmation } from '@/components/ui/coreor-confirm-modal';
import { useAppContextMenu } from '@/components/app-context-menu';
import { useLanguage } from '@/context/LanguageContext';

const controlClass = 'h-8 rounded border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-cyan-500/60';

interface DatabaseUserManagerModalProps {
  open: boolean;
  onClose: () => void;
  serverId: string | null;
  accountId?: string | null;
  databases: DatabaseCatalogItem[];
}

function accountKey(account: Pick<DatabaseAccountInfo, 'user' | 'host'>) {
  return `${account.user}@${account.host}`;
}

export function DatabaseUserManagerModal({ open, onClose, serverId, accountId, databases }: DatabaseUserManagerModalProps) {
  const { openContextMenu } = useAppContextMenu();
  const {t,language}=useLanguage();
  const [users, setUsers] = useState<DatabaseAccountInfo[]>([]);
  const [roles, setRoles] = useState<DatabaseAccountInfo[]>([]);
  const [assignments, setAssignments] = useState<Array<{ roleUser: string; roleHost: string; user: string; host: string; isDefault: boolean }>>([]);
  const [selected, setSelected] = useState<DatabaseAccountInfo | null>(null);
  const [grants, setGrants] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  useModalEscape(open, onClose, busy);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [userDraft, setUserDraft] = useState({ user: '', host: '%', password: '', accountLocked: false, passwordExpired: false });
  const [privilegeDraft, setPrivilegeDraft] = useState<{ scope: DatabasePrivilegeScope; database: string; table: string; privileges: string[]; withGrantOption: boolean }>({ scope: 'database', database: '', table: '', privileges: ['SELECT'], withGrantOption: false });
  const [roleName, setRoleName] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [makeDefaultRole, setMakeDefaultRole] = useState(true);
  const [confirmation, setConfirmation] = useState<CoreorConfirmation | null>(null);

  const selectedDatabase = databases.find(database => database.name === privilegeDraft.database);
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(language);
    return users.filter(user => !query || `${user.user}@${user.host}`.toLocaleLowerCase(language).includes(query));
  }, [users, search, language]);

  const load = async () => {
    if (!serverId || !accountId) return;
    setLoading(true); setError(null);
    try {
      const result = await listDatabaseUsers(serverId, accountId);
      setUsers(result.users); setRoles(result.roles); setAssignments(result.assignments);
      if (selected) setSelected(result.users.find(item => accountKey(item) === accountKey(selected)) || null);
      if (!privilegeDraft.database && databases[0]) setPrivilegeDraft(previous => ({ ...previous, database: databases[0].name }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('userManager.loadFailed'));
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open) void load(); }, [open, serverId, accountId]);
  useEffect(() => {
    if (!selected || !serverId || !accountId) { setGrants([]); return; }
    setUserDraft({ user: selected.user, host: selected.host, password: '', accountLocked: selected.accountLocked, passwordExpired: selected.passwordExpired });
    setSelectedRole('');
    void getDatabaseUserGrants(serverId, selected.user, selected.host, accountId).then(result => setGrants(result.grants)).catch(() => setGrants([]));
  }, [selected, serverId, accountId]);

  if (!open || typeof document === 'undefined') return null;

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(null); setMessage(null);
    try { await operation(); setMessage(success); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : t('userManager.operationFailed')); }
    finally { setBusy(false); }
  };

  const newUser = () => {
    setSelected(null); setGrants([]);
    setUserDraft({ user: '', host: '%', password: '', accountLocked: false, passwordExpired: false });
  };

  const saveUser = () => {
    if (!serverId || !accountId || !userDraft.user.trim() || !userDraft.host.trim()) return;
    void run(() => saveDatabaseUser(serverId, {
      originalUser: selected?.user, originalHost: selected?.host,
      user: userDraft.user, host: userDraft.host, password: userDraft.password || undefined,
      accountLocked: userDraft.accountLocked, passwordExpired: userDraft.passwordExpired,
      createIfMissing: !selected
    }, accountId), selected ? t('userManager.userUpdated') : t('userManager.userCreated'));
  };

  const requestRemoveUser = (target: DatabaseAccountInfo) => {
    if (!serverId || !accountId) return;
    setConfirmation({
      title: t('userManager.deleteDatabaseUser'),
      description: t('userManager.deleteDescription',{account:`${target.user}@${target.host}`}),
      confirmLabel: t('userManager.deleteUser'),
      tone: 'danger',
      onConfirm: async () => {
        await run(() => dropDatabaseUser(serverId, target.user, target.host, accountId), t('userManager.userDeleted'));
        if (selected && accountKey(selected) === accountKey(target)) setSelected(null);
      }
    });
  };
  const removeUser = () => { if (selected) requestRemoveUser(selected); };
  const openUserMenu = (event: React.MouseEvent, user: DatabaseAccountInfo) => openContextMenu(event, [
    { id: 'select', label: t('userManager.openUser'), icon: UserCog, onSelect: () => setSelected(user) },
    { id: 'copy-account', label: t('userManager.copyAccount'), icon: Copy, onSelect: () => navigator.clipboard.writeText(accountKey(user)) },
    { id: 'copy-user', label: t('userManager.copyUsername'), icon: Copy, onSelect: () => navigator.clipboard.writeText(user.user) },
    { id: 'copy-host', label: t('userManager.copyHost'), icon: Copy, onSelect: () => navigator.clipboard.writeText(user.host) },
    { id: 'sep-danger', separator: true },
    { id: 'delete', label: t('userManager.deleteUser'), icon: Trash2, danger: true, disabled: busy, onSelect: () => requestRemoveUser(user) }
  ], accountKey(user));

  const changePrivilege = (mode: 'grant' | 'revoke') => {
    if (!selected || !serverId || !accountId || privilegeDraft.privileges.length === 0) return;
    void run(() => changeDatabasePrivileges(serverId, {
      mode, user: selected.user, host: selected.host, scope: privilegeDraft.scope,
      database: privilegeDraft.database || undefined, table: privilegeDraft.table || undefined,
      privileges: privilegeDraft.privileges, withGrantOption: privilegeDraft.withGrantOption
    }, accountId), mode === 'grant' ? t('userManager.permissionsGranted') : t('userManager.permissionsRevoked'));
  };

  const createRole = () => {
    if (!serverId || !accountId || !roleName.trim()) return;
    void run(() => createDatabaseRole(serverId, roleName.trim(), accountId), t('userManager.roleCreated'));
    setRoleName('');
  };

  const assignRole = (mode: 'grant' | 'revoke') => {
    if (!selected || !selectedRole || !serverId || !accountId) return;
    const role = roles.find(item => accountKey(item) === selectedRole);
    if (!role) return;
    void run(() => assignDatabaseRole(serverId, { role: role.user, roleHost: role.host, user: selected.user, host: selected.host, mode, makeDefault: makeDefaultRole }, accountId), mode === 'grant' ? t('userManager.roleAssigned') : t('userManager.roleRemoved'));
  };

  return <>
    {createPortal(
    <div className="fixed inset-0 z-[320] flex items-center justify-center p-2 sm:p-3">
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" aria-label={t('common.close')} onClick={onClose} />
      <div className="relative z-10 flex h-[calc(100dvh-16px)] max-h-[820px] w-[calc(100vw-16px)] max-w-[1180px] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)]">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 px-4"><Users className="h-4 w-4 text-cyan-400" /><div><h2 className="text-sm font-semibold">{t('userManager.title')}</h2><p className="text-[10px] text-zinc-500">{t('userManager.subtitle')}</p></div><Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button></div>
        {(error || message) && <div className={`shrink-0 border-b px-4 py-2 text-xs ${error ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>{error || message}</div>}
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[clamp(190px,27vw,280px)_minmax(0,1fr)]">
          <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-zinc-800">
            <div className="space-y-2 border-b border-zinc-800 p-2"><div className="flex gap-1"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('userManager.searchUser')} className="h-8 text-xs" /><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button></div><Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={newUser}><Plus className="mr-1.5 h-3.5 w-3.5" /> {t('userManager.newUser')}</Button></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">{loading ? <div className="flex items-center gap-2 p-3 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> {t('userManager.loading')}</div> : filteredUsers.map(user => <button key={accountKey(user)} type="button" onClick={() => setSelected(user)} onContextMenu={event => openUserMenu(event, user)} className={`mb-0.5 flex w-full items-center gap-2 rounded p-2 text-left ${selected && accountKey(selected) === accountKey(user) ? 'bg-cyan-500/10 text-cyan-200' : 'hover:bg-zinc-900'}`}><UserCog className="h-4 w-4 shrink-0 text-zinc-500" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{user.user}</span><span className="block truncate text-[10px] text-zinc-600">@{user.host} • {user.plugin || t('common.default')}</span></span>{user.accountLocked && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300">{t('userManager.locked')}</span>}</button>)}</div>
          </aside>
          <main className="min-h-0 overflow-hidden">
            <Tabs defaultValue="account" className="flex h-full min-h-0 flex-col">
              <TabsList className="h-10 shrink-0 justify-start rounded-none border-b border-zinc-800 bg-zinc-950 px-2"><TabsTrigger value="account" className="h-9 text-xs">{t('settingsCatalog.account.account')}</TabsTrigger><TabsTrigger value="privileges" className="h-9 text-xs" disabled={!selected}>{t('userManager.permissionMatrix')}</TabsTrigger><TabsTrigger value="roles" className="h-9 text-xs">{t('userManager.roles')}</TabsTrigger><TabsTrigger value="grants" className="h-9 text-xs" disabled={!selected}>SHOW GRANTS</TabsTrigger></TabsList>
              <TabsContent value="account" className="m-0 min-h-0 flex-1 overflow-y-auto p-4"><div className="mx-auto max-w-2xl space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-500">{t('userManager.username')}<Input value={userDraft.user} onChange={event => setUserDraft(previous => ({ ...previous, user: event.target.value }))} className="mt-1 h-8 text-xs" /></label><label className="text-xs text-zinc-500">Host<Input value={userDraft.host} onChange={event => setUserDraft(previous => ({ ...previous, host: event.target.value }))} className="mt-1 h-8 text-xs" placeholder="% veya 10.0.%" /></label><label className="text-xs text-zinc-500 sm:col-span-2">{selected ? t('userManager.newPassword') : t('userManager.password')}<Input type="password" autoComplete="new-password" value={userDraft.password} onChange={event => setUserDraft(previous => ({ ...previous, password: event.target.value }))} className="mt-1 h-8 text-xs" /></label></div><div className="grid gap-2 sm:grid-cols-2"><label className="flex items-center gap-2 rounded border border-zinc-800 p-3 text-xs"><input type="checkbox" checked={userDraft.accountLocked} onChange={event => setUserDraft(previous => ({ ...previous, accountLocked: event.target.checked }))} /> {t('userManager.lockAccount')}</label><label className="flex items-center gap-2 rounded border border-zinc-800 p-3 text-xs"><input type="checkbox" checked={userDraft.passwordExpired} onChange={event => setUserDraft(previous => ({ ...previous, passwordExpired: event.target.checked }))} /> {t('userManager.passwordExpired')}</label></div><div className="flex gap-2"><Button size="sm" disabled={busy || !userDraft.user.trim() || !userDraft.host.trim()} onClick={saveUser}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Kaydet</Button>{selected && <Button size="sm" variant="destructive" disabled={busy} onClick={removeUser}><Trash2 className="mr-2 h-4 w-4" /> {t('userManager.deleteUser')}</Button>}</div></div></TabsContent>
              <TabsContent value="privileges" className="m-0 min-h-0 flex-1 overflow-y-auto p-4"><div className="space-y-4"><div className="grid gap-2 md:grid-cols-3"><label className="text-xs text-zinc-500">{t('userManager.scope')}<select className={`${controlClass} mt-1 w-full`} value={privilegeDraft.scope} onChange={event => setPrivilegeDraft(previous => ({ ...previous, scope: event.target.value as DatabasePrivilegeScope }))}><option value="global">{t('userManager.serverScope')}</option><option value="database">{t('catalog.database')}</option><option value="table">{t('catalog.table')}</option></select></label><label className="text-xs text-zinc-500">{t('catalog.database')}<select disabled={privilegeDraft.scope === 'global'} className={`${controlClass} mt-1 w-full disabled:opacity-40`} value={privilegeDraft.database} onChange={event => setPrivilegeDraft(previous => ({ ...previous, database: event.target.value, table: '' }))}><option value="">{t('userManager.select')}</option>{databases.map(database => <option key={database.name}>{database.name}</option>)}</select></label><label className="text-xs text-zinc-500">{t('catalog.table')}<select disabled={privilegeDraft.scope !== 'table'} className={`${controlClass} mt-1 w-full disabled:opacity-40`} value={privilegeDraft.table} onChange={event => setPrivilegeDraft(previous => ({ ...previous, table: event.target.value }))}><option value="">{t('userManager.select')}</option>{(selectedDatabase?.tables || []).map(table => <option key={table}>{table}</option>)}</select></label></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{DATABASE_PRIVILEGES.map(privilege => <label key={privilege} className={`flex cursor-pointer items-center gap-2 rounded border p-2 text-[11px] ${privilegeDraft.privileges.includes(privilege) ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-zinc-800 text-zinc-400'}`}><input type="checkbox" checked={privilegeDraft.privileges.includes(privilege)} onChange={event => setPrivilegeDraft(previous => ({ ...previous, privileges: event.target.checked ? [...previous.privileges, privilege] : previous.privileges.filter(item => item !== privilege) }))} />{privilege}</label>)}</div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={privilegeDraft.withGrantOption} onChange={event => setPrivilegeDraft(previous => ({ ...previous, withGrantOption: event.target.checked }))} /> WITH GRANT OPTION</label><div className="flex gap-2"><Button size="sm" disabled={busy || !selected || !privilegeDraft.privileges.length} onClick={() => changePrivilege('grant')}><Shield className="mr-2 h-4 w-4" /> GRANT</Button><Button size="sm" variant="destructive" disabled={busy || !selected || !privilegeDraft.privileges.length} onClick={() => changePrivilege('revoke')}><Shield className="mr-2 h-4 w-4" /> REVOKE</Button></div></div></TabsContent>
              <TabsContent value="roles" className="m-0 min-h-0 flex-1 overflow-y-auto p-4"><div className="space-y-5"><div className="rounded-xl border border-zinc-800 p-4"><h3 className="mb-3 text-xs font-semibold">{t('userManager.newRole')}</h3><div className="flex gap-2"><Input value={roleName} onChange={event => setRoleName(event.target.value)} placeholder="report_reader" className="h-8 text-xs" /><Button size="sm" disabled={busy || !roleName.trim()} onClick={createRole}><Plus className="mr-1.5 h-4 w-4" /> {t('common.create')}</Button></div></div><div className="rounded-xl border border-zinc-800 p-4"><h3 className="mb-3 text-xs font-semibold">{t('userManager.roleAssignment')}</h3>{!selected ? <p className="text-xs text-zinc-500">{t('userManager.selectUserFirst')}</p> : <div className="space-y-3"><select value={selectedRole} onChange={event => setSelectedRole(event.target.value)} className={`${controlClass} w-full`}><option value="">{t('userManager.selectRole')}</option>{roles.map(role => <option key={accountKey(role)} value={accountKey(role)}>{role.user}@{role.host}</option>)}</select><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={makeDefaultRole} onChange={event => setMakeDefaultRole(event.target.checked)} /> {t('userManager.makeDefaultRole')}</label><div className="flex gap-2"><Button size="sm" disabled={busy || !selectedRole} onClick={() => assignRole('grant')}>{t('userManager.assignRole')}</Button><Button size="sm" variant="outline" disabled={busy || !selectedRole} onClick={() => assignRole('revoke')}>{t('userManager.removeRole')}</Button></div><div className="space-y-1 border-t border-zinc-800 pt-3 text-[10px] text-zinc-500">{assignments.filter(item => item.user === selected.user && item.host === selected.host).map(item => <div key={`${item.roleUser}@${item.roleHost}`} className="flex justify-between rounded bg-zinc-900 p-2"><span>{item.roleUser}@{item.roleHost}</span><span>{item.isDefault ? t('userManager.defaultRole') : t('userManager.assigned')}</span></div>)}</div></div>}</div></div></TabsContent>
              <TabsContent value="grants" className="m-0 min-h-0 flex-1 overflow-y-auto p-4"><div className="space-y-2">{grants.length ? grants.map(grant => <pre key={grant} className="overflow-x-auto rounded-lg border border-zinc-800 bg-black/30 p-3 font-mono text-[11px] leading-5 text-cyan-100">{grant}</pre>) : <div className="text-xs text-zinc-500">{t('userManager.noGrantInfo')}</div>}</div></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </div>,
    document.body
  )}
    <CoreorConfirmModal action={confirmation} onClose={() => setConfirmation(null)} />
  </>;
}
