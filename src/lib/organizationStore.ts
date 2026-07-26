'use client';

import { useSyncExternalStore } from 'react';
import type {
  DatabaseOrganization,
  DatabaseOrganizationMember,
  OrganizationDatabaseBinding,
  OrganizationRole
} from 'types';

const STORAGE_KEY = 'coreor:organizations:v1';
const listeners = new Set<() => void>();
let snapshot: DatabaseOrganization[] = [];
let hydrated = false;

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || `organization-${Date.now()}`;
}

function normalizeMember(value: Partial<DatabaseOrganizationMember>): DatabaseOrganizationMember {
  return {
    id: value.id || createId('member'),
    name: String(value.name || value.email || 'Üye'),
    email: String(value.email || '').trim(),
    role: (['owner', 'admin', 'developer', 'analyst', 'viewer'] as OrganizationRole[]).includes(value.role as OrganizationRole) ? value.role as OrganizationRole : 'viewer',
    status: value.status === 'invited' || value.status === 'suspended' ? value.status : 'active',
    addedAt: value.addedAt || new Date().toISOString()
  };
}

function normalizeOrganization(value: Partial<DatabaseOrganization>): DatabaseOrganization {
  const name = String(value.name || 'Yeni organizasyon').trim();
  return {
    id: value.id || createId('organization'),
    name,
    slug: slugify(value.slug || name),
    description: String(value.description || ''),
    avatar: value.avatar,
    ownerEmail: String(value.ownerEmail || ''),
    members: Array.isArray(value.members) ? value.members.map(normalizeMember) : [],
    databases: Array.isArray(value.databases)
      ? value.databases.filter(item => item && typeof item.serverId === 'string' && typeof item.databaseName === 'string').map(item => ({ serverId: item.serverId, databaseName: item.databaseName }))
      : [],
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt || new Date().toISOString()
  };
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    snapshot = Array.isArray(parsed) ? parsed.map(normalizeOrganization) : [];
  } catch {
    snapshot = [];
  }
}

function persist() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* organizations remain usable for the current session */ }
}

function emit() {
  persist();
  listeners.forEach(listener => listener());
}

export function getOrganizations() {
  hydrate();
  return snapshot;
}

export function getServerOrganizations() {
  return [] as DatabaseOrganization[];
}

export function subscribeOrganizations(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function createOrganization(input: { name: string; description?: string; ownerEmail?: string }) {
  hydrate();
  const organization = normalizeOrganization({
    name: input.name,
    description: input.description,
    ownerEmail: input.ownerEmail,
    members: input.ownerEmail ? [{
      id: createId('member'), name: input.ownerEmail.split('@')[0], email: input.ownerEmail,
      role: 'owner', status: 'active', addedAt: new Date().toISOString()
    }] : []
  });
  snapshot = [organization, ...snapshot];
  emit();
  return organization;
}

export function updateOrganization(id: string, patch: Partial<Pick<DatabaseOrganization, 'name' | 'slug' | 'description' | 'avatar' | 'ownerEmail'>>) {
  hydrate();
  snapshot = snapshot.map(item => item.id === id ? normalizeOrganization({ ...item, ...patch, updatedAt: new Date().toISOString() }) : item);
  emit();
}

export function deleteOrganization(id: string) {
  hydrate();
  snapshot = snapshot.filter(item => item.id !== id);
  emit();
}

export function addOrganizationMember(organizationId: string, input: { name: string; email: string; role: OrganizationRole }) {
  hydrate();
  snapshot = snapshot.map(item => item.id !== organizationId ? item : {
    ...item,
    members: [...item.members.filter(member => member.email.toLocaleLowerCase('tr-TR') !== input.email.toLocaleLowerCase('tr-TR')), normalizeMember({ ...input, status: 'invited' })],
    updatedAt: new Date().toISOString()
  });
  emit();
}

export function updateOrganizationMember(organizationId: string, memberId: string, patch: Partial<Pick<DatabaseOrganizationMember, 'name' | 'role' | 'status'>>) {
  hydrate();
  snapshot = snapshot.map(item => item.id !== organizationId ? item : {
    ...item,
    members: item.members.map(member => member.id === memberId ? normalizeMember({ ...member, ...patch }) : member),
    updatedAt: new Date().toISOString()
  });
  emit();
}

export function removeOrganizationMember(organizationId: string, memberId: string) {
  hydrate();
  snapshot = snapshot.map(item => item.id !== organizationId ? item : {
    ...item,
    members: item.members.filter(member => member.id !== memberId),
    updatedAt: new Date().toISOString()
  });
  emit();
}

export function setOrganizationDatabaseBinding(organizationId: string, binding: OrganizationDatabaseBinding, enabled: boolean) {
  hydrate();
  snapshot = snapshot.map(item => {
    if (item.id !== organizationId) return item;
    const matches = (candidate: OrganizationDatabaseBinding) => candidate.serverId === binding.serverId && candidate.databaseName === binding.databaseName;
    return {
      ...item,
      databases: enabled
        ? [...item.databases.filter(candidate => !matches(candidate)), binding]
        : item.databases.filter(candidate => !matches(candidate)),
      updatedAt: new Date().toISOString()
    };
  });
  emit();
}

export function useOrganizations() {
  const organizations = useSyncExternalStore(subscribeOrganizations, getOrganizations, getServerOrganizations);
  return {
    organizations,
    createOrganization,
    updateOrganization,
    deleteOrganization,
    addOrganizationMember,
    updateOrganizationMember,
    removeOrganizationMember,
    setOrganizationDatabaseBinding
  };
}
