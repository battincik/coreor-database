'use client';

import type { DatabaseEngine, TableColumnInfo } from 'types';
import type { ActivityEntry } from '@/lib/activityConsole';
import type { DatabasePerformanceSnapshot } from '@/lib/databaseWorkbenchTypes';

export type MaskKind =
  | 'redact' | 'email' | 'phone' | 'tc' | 'address' | 'iban' | 'credit-card'
  | 'first-name' | 'last-name' | 'full-name' | 'username' | 'password' | 'company'
  | 'city' | 'country' | 'postal-code' | 'url' | 'domain' | 'ipv4' | 'ipv6' | 'mac'
  | 'uuid' | 'snowflake' | 'token' | 'api-key' | 'date' | 'datetime' | 'birthdate'
  | 'amount' | 'currency' | 'percentage' | 'latitude' | 'longitude' | 'coordinate'
  | 'plate-tr' | 'serial' | 'keep-first-2' | 'keep-last-4' | 'hash' | 'null';

export interface MaskTypeDefinition {
  id: MaskKind;
  labelKey: string;
  descriptionKey: string;
  categoryKey: string;
}

export const MASK_TYPES: MaskTypeDefinition[] = [
  { id: 'redact', labelKey: 'intelligenceCatalog.mask.redact.label', descriptionKey: 'intelligenceCatalog.mask.redact.description', categoryKey: 'intelligenceCatalog.categories.general' },
  { id: 'keep-first-2', labelKey: 'intelligenceCatalog.mask.keep-first-2.label', descriptionKey: 'intelligenceCatalog.mask.keep-first-2.description', categoryKey: 'intelligenceCatalog.categories.general' },
  { id: 'keep-last-4', labelKey: 'intelligenceCatalog.mask.keep-last-4.label', descriptionKey: 'intelligenceCatalog.mask.keep-last-4.description', categoryKey: 'intelligenceCatalog.categories.general' },
  { id: 'hash', labelKey: 'intelligenceCatalog.mask.hash.label', descriptionKey: 'intelligenceCatalog.mask.hash.description', categoryKey: 'intelligenceCatalog.categories.technical' },
  { id: 'null', labelKey: 'intelligenceCatalog.mask.null.label', descriptionKey: 'intelligenceCatalog.mask.null.description', categoryKey: 'intelligenceCatalog.categories.general' },
  { id: 'email', labelKey: 'intelligenceCatalog.mask.email.label', descriptionKey: 'intelligenceCatalog.mask.email.description', categoryKey: 'intelligenceCatalog.categories.communication' },
  { id: 'phone', labelKey: 'intelligenceCatalog.mask.phone.label', descriptionKey: 'intelligenceCatalog.mask.phone.description', categoryKey: 'intelligenceCatalog.categories.communication' },
  { id: 'tc', labelKey: 'intelligenceCatalog.mask.tc.label', descriptionKey: 'intelligenceCatalog.mask.tc.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'address', labelKey: 'intelligenceCatalog.mask.address.label', descriptionKey: 'intelligenceCatalog.mask.address.description', categoryKey: 'intelligenceCatalog.categories.location' },
  { id: 'iban', labelKey: 'intelligenceCatalog.mask.iban.label', descriptionKey: 'intelligenceCatalog.mask.iban.description', categoryKey: 'intelligenceCatalog.categories.finance' },
  { id: 'credit-card', labelKey: 'intelligenceCatalog.mask.credit-card.label', descriptionKey: 'intelligenceCatalog.mask.credit-card.description', categoryKey: 'intelligenceCatalog.categories.finance' },
  { id: 'first-name', labelKey: 'intelligenceCatalog.mask.first-name.label', descriptionKey: 'intelligenceCatalog.mask.first-name.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'last-name', labelKey: 'intelligenceCatalog.mask.last-name.label', descriptionKey: 'intelligenceCatalog.mask.last-name.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'full-name', labelKey: 'intelligenceCatalog.mask.full-name.label', descriptionKey: 'intelligenceCatalog.mask.full-name.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'username', labelKey: 'intelligenceCatalog.mask.username.label', descriptionKey: 'intelligenceCatalog.mask.username.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'password', labelKey: 'intelligenceCatalog.mask.password.label', descriptionKey: 'intelligenceCatalog.mask.password.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'company', labelKey: 'intelligenceCatalog.mask.company.label', descriptionKey: 'intelligenceCatalog.mask.company.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'city', labelKey: 'intelligenceCatalog.mask.city.label', descriptionKey: 'intelligenceCatalog.mask.city.description', categoryKey: 'intelligenceCatalog.categories.location' },
  { id: 'country', labelKey: 'intelligenceCatalog.mask.country.label', descriptionKey: 'intelligenceCatalog.mask.country.description', categoryKey: 'intelligenceCatalog.categories.location' },
  { id: 'postal-code', labelKey: 'intelligenceCatalog.mask.postal-code.label', descriptionKey: 'intelligenceCatalog.mask.postal-code.description', categoryKey: 'intelligenceCatalog.categories.location' },
  { id: 'url', labelKey: 'intelligenceCatalog.mask.url.label', descriptionKey: 'intelligenceCatalog.mask.url.description', categoryKey: 'intelligenceCatalog.categories.network' },
  { id: 'domain', labelKey: 'intelligenceCatalog.mask.domain.label', descriptionKey: 'intelligenceCatalog.mask.domain.description', categoryKey: 'intelligenceCatalog.categories.network' },
  { id: 'ipv4', labelKey: 'intelligenceCatalog.mask.ipv4.label', descriptionKey: 'intelligenceCatalog.mask.ipv4.description', categoryKey: 'intelligenceCatalog.categories.network' },
  { id: 'ipv6', labelKey: 'intelligenceCatalog.mask.ipv6.label', descriptionKey: 'intelligenceCatalog.mask.ipv6.description', categoryKey: 'intelligenceCatalog.categories.network' },
  { id: 'mac', labelKey: 'intelligenceCatalog.mask.mac.label', descriptionKey: 'intelligenceCatalog.mask.mac.description', categoryKey: 'intelligenceCatalog.categories.network' },
  { id: 'uuid', labelKey: 'intelligenceCatalog.mask.uuid.label', descriptionKey: 'intelligenceCatalog.mask.uuid.description', categoryKey: 'intelligenceCatalog.categories.technical' },
  { id: 'snowflake', labelKey: 'intelligenceCatalog.mask.snowflake.label', descriptionKey: 'intelligenceCatalog.mask.snowflake.description', categoryKey: 'intelligenceCatalog.categories.technical' },
  { id: 'token', labelKey: 'intelligenceCatalog.mask.token.label', descriptionKey: 'intelligenceCatalog.mask.token.description', categoryKey: 'intelligenceCatalog.categories.technical' },
  { id: 'api-key', labelKey: 'intelligenceCatalog.mask.api-key.label', descriptionKey: 'intelligenceCatalog.mask.api-key.description', categoryKey: 'intelligenceCatalog.categories.technical' },
  { id: 'date', labelKey: 'intelligenceCatalog.mask.date.label', descriptionKey: 'intelligenceCatalog.mask.date.description', categoryKey: 'intelligenceCatalog.categories.general' },
  { id: 'datetime', labelKey: 'intelligenceCatalog.mask.datetime.label', descriptionKey: 'intelligenceCatalog.mask.datetime.description', categoryKey: 'intelligenceCatalog.categories.general' },
  { id: 'birthdate', labelKey: 'intelligenceCatalog.mask.birthdate.label', descriptionKey: 'intelligenceCatalog.mask.birthdate.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'amount', labelKey: 'intelligenceCatalog.mask.amount.label', descriptionKey: 'intelligenceCatalog.mask.amount.description', categoryKey: 'intelligenceCatalog.categories.finance' },
  { id: 'currency', labelKey: 'intelligenceCatalog.mask.currency.label', descriptionKey: 'intelligenceCatalog.mask.currency.description', categoryKey: 'intelligenceCatalog.categories.finance' },
  { id: 'percentage', labelKey: 'intelligenceCatalog.mask.percentage.label', descriptionKey: 'intelligenceCatalog.mask.percentage.description', categoryKey: 'intelligenceCatalog.categories.finance' },
  { id: 'latitude', labelKey: 'intelligenceCatalog.mask.latitude.label', descriptionKey: 'intelligenceCatalog.mask.latitude.description', categoryKey: 'intelligenceCatalog.categories.location' },
  { id: 'longitude', labelKey: 'intelligenceCatalog.mask.longitude.label', descriptionKey: 'intelligenceCatalog.mask.longitude.description', categoryKey: 'intelligenceCatalog.categories.location' },
  { id: 'coordinate', labelKey: 'intelligenceCatalog.mask.coordinate.label', descriptionKey: 'intelligenceCatalog.mask.coordinate.description', categoryKey: 'intelligenceCatalog.categories.location' },
  { id: 'plate-tr', labelKey: 'intelligenceCatalog.mask.plate-tr.label', descriptionKey: 'intelligenceCatalog.mask.plate-tr.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'serial', labelKey: 'intelligenceCatalog.mask.serial.label', descriptionKey: 'intelligenceCatalog.mask.serial.description', categoryKey: 'intelligenceCatalog.categories.technical' }
];

export type MockDataKind =
  | 'sequential-id' | 'snowflake-id' | 'uuid' | 'ulid' | 'integer' | 'bigint' | 'decimal'
  | 'boolean' | 'first-name' | 'last-name' | 'full-name' | 'username' | 'email'
  | 'phone-tr' | 'phone-intl' | 'tc' | 'iban-tr' | 'credit-card-test' | 'company'
  | 'job-title' | 'address-tr' | 'city-tr' | 'district-tr' | 'country' | 'postal-code'
  | 'url' | 'domain' | 'ipv4' | 'ipv6' | 'mac' | 'date' | 'datetime' | 'birthdate'
  | 'unix-timestamp' | 'amount' | 'currency-code' | 'percentage' | 'latitude' | 'longitude'
  | 'coordinate' | 'plate-tr' | 'sentence' | 'paragraph' | 'slug' | 'hex' | 'color'
  | 'json-object' | 'enum' | 'constant' | 'null';

export interface MockTypeDefinition {
  id: MockDataKind;
  labelKey: string;
  descriptionKey: string;
  categoryKey: string;
}

export const MOCK_DATA_TYPES: MockTypeDefinition[] = [
  { id: 'sequential-id', labelKey: 'intelligenceCatalog.mock.sequential-id.label', descriptionKey: 'intelligenceCatalog.mock.sequential-id.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'snowflake-id', labelKey: 'intelligenceCatalog.mock.snowflake-id.label', descriptionKey: 'intelligenceCatalog.mock.snowflake-id.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'uuid', labelKey: 'intelligenceCatalog.mock.uuid.label', descriptionKey: 'intelligenceCatalog.mock.uuid.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'ulid', labelKey: 'intelligenceCatalog.mock.ulid.label', descriptionKey: 'intelligenceCatalog.mock.ulid.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'integer', labelKey: 'intelligenceCatalog.mock.integer.label', descriptionKey: 'intelligenceCatalog.mock.integer.description', categoryKey: 'intelligenceCatalog.categories.numeric' },
  { id: 'bigint', labelKey: 'intelligenceCatalog.mock.bigint.label', descriptionKey: 'intelligenceCatalog.mock.bigint.description', categoryKey: 'intelligenceCatalog.categories.numeric' },
  { id: 'decimal', labelKey: 'intelligenceCatalog.mock.decimal.label', descriptionKey: 'intelligenceCatalog.mock.decimal.description', categoryKey: 'intelligenceCatalog.categories.numeric' },
  { id: 'boolean', labelKey: 'intelligenceCatalog.mock.boolean.label', descriptionKey: 'intelligenceCatalog.mock.boolean.description', categoryKey: 'intelligenceCatalog.categories.boolean' },
  { id: 'first-name', labelKey: 'intelligenceCatalog.mock.first-name.label', descriptionKey: 'intelligenceCatalog.mock.first-name.description', categoryKey: 'intelligenceCatalog.categories.person' },
  { id: 'last-name', labelKey: 'intelligenceCatalog.mock.last-name.label', descriptionKey: 'intelligenceCatalog.mock.last-name.description', categoryKey: 'intelligenceCatalog.categories.person' },
  { id: 'full-name', labelKey: 'intelligenceCatalog.mock.full-name.label', descriptionKey: 'intelligenceCatalog.mock.full-name.description', categoryKey: 'intelligenceCatalog.categories.person' },
  { id: 'username', labelKey: 'intelligenceCatalog.mock.username.label', descriptionKey: 'intelligenceCatalog.mock.username.description', categoryKey: 'intelligenceCatalog.categories.person' },
  { id: 'email', labelKey: 'intelligenceCatalog.mock.email.label', descriptionKey: 'intelligenceCatalog.mock.email.description', categoryKey: 'intelligenceCatalog.categories.communication' },
  { id: 'phone-tr', labelKey: 'intelligenceCatalog.mock.phone-tr.label', descriptionKey: 'intelligenceCatalog.mock.phone-tr.description', categoryKey: 'intelligenceCatalog.categories.communication' },
  { id: 'phone-intl', labelKey: 'intelligenceCatalog.mock.phone-intl.label', descriptionKey: 'intelligenceCatalog.mock.phone-intl.description', categoryKey: 'intelligenceCatalog.categories.communication' },
  { id: 'tc', labelKey: 'intelligenceCatalog.mock.tc.label', descriptionKey: 'intelligenceCatalog.mock.tc.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'iban-tr', labelKey: 'intelligenceCatalog.mock.iban-tr.label', descriptionKey: 'intelligenceCatalog.mock.iban-tr.description', categoryKey: 'intelligenceCatalog.categories.finance' },
  { id: 'credit-card-test', labelKey: 'intelligenceCatalog.mock.credit-card-test.label', descriptionKey: 'intelligenceCatalog.mock.credit-card-test.description', categoryKey: 'intelligenceCatalog.categories.finance' },
  { id: 'company', labelKey: 'intelligenceCatalog.mock.company.label', descriptionKey: 'intelligenceCatalog.mock.company.description', categoryKey: 'intelligenceCatalog.categories.business' },
  { id: 'job-title', labelKey: 'intelligenceCatalog.mock.job-title.label', descriptionKey: 'intelligenceCatalog.mock.job-title.description', categoryKey: 'intelligenceCatalog.categories.business' },
  { id: 'address-tr', labelKey: 'intelligenceCatalog.mock.address-tr.label', descriptionKey: 'intelligenceCatalog.mock.address-tr.description', categoryKey: 'intelligenceCatalog.categories.location' },
  { id: 'city-tr', labelKey: 'intelligenceCatalog.mock.city-tr.label', descriptionKey: 'intelligenceCatalog.mock.city-tr.description', categoryKey: 'intelligenceCatalog.categories.location' },
  { id: 'district-tr', labelKey: 'intelligenceCatalog.mock.district-tr.label', descriptionKey: 'intelligenceCatalog.mock.district-tr.description', categoryKey: 'intelligenceCatalog.categories.location' },
  { id: 'country', labelKey: 'intelligenceCatalog.mock.country.label', descriptionKey: 'intelligenceCatalog.mock.country.description', categoryKey: 'intelligenceCatalog.categories.location' },
  { id: 'postal-code', labelKey: 'intelligenceCatalog.mock.postal-code.label', descriptionKey: 'intelligenceCatalog.mock.postal-code.description', categoryKey: 'intelligenceCatalog.categories.location' },
  { id: 'url', labelKey: 'intelligenceCatalog.mock.url.label', descriptionKey: 'intelligenceCatalog.mock.url.description', categoryKey: 'intelligenceCatalog.categories.network' },
  { id: 'domain', labelKey: 'intelligenceCatalog.mock.domain.label', descriptionKey: 'intelligenceCatalog.mock.domain.description', categoryKey: 'intelligenceCatalog.categories.network' },
  { id: 'ipv4', labelKey: 'intelligenceCatalog.mock.ipv4.label', descriptionKey: 'intelligenceCatalog.mock.ipv4.description', categoryKey: 'intelligenceCatalog.categories.network' },
  { id: 'ipv6', labelKey: 'intelligenceCatalog.mock.ipv6.label', descriptionKey: 'intelligenceCatalog.mock.ipv6.description', categoryKey: 'intelligenceCatalog.categories.network' },
  { id: 'mac', labelKey: 'intelligenceCatalog.mock.mac.label', descriptionKey: 'intelligenceCatalog.mock.mac.description', categoryKey: 'intelligenceCatalog.categories.network' },
  { id: 'date', labelKey: 'intelligenceCatalog.mock.date.label', descriptionKey: 'intelligenceCatalog.mock.date.description', categoryKey: 'intelligenceCatalog.categories.time' },
  { id: 'datetime', labelKey: 'intelligenceCatalog.mock.datetime.label', descriptionKey: 'intelligenceCatalog.mock.datetime.description', categoryKey: 'intelligenceCatalog.categories.time' },
  { id: 'birthdate', labelKey: 'intelligenceCatalog.mock.birthdate.label', descriptionKey: 'intelligenceCatalog.mock.birthdate.description', categoryKey: 'intelligenceCatalog.categories.time' },
  { id: 'unix-timestamp', labelKey: 'intelligenceCatalog.mock.unix-timestamp.label', descriptionKey: 'intelligenceCatalog.mock.unix-timestamp.description', categoryKey: 'intelligenceCatalog.categories.time' },
  { id: 'amount', labelKey: 'intelligenceCatalog.mock.amount.label', descriptionKey: 'intelligenceCatalog.mock.amount.description', categoryKey: 'intelligenceCatalog.categories.finance' },
  { id: 'currency-code', labelKey: 'intelligenceCatalog.mock.currency-code.label', descriptionKey: 'intelligenceCatalog.mock.currency-code.description', categoryKey: 'intelligenceCatalog.categories.finance' },
  { id: 'percentage', labelKey: 'intelligenceCatalog.mock.percentage.label', descriptionKey: 'intelligenceCatalog.mock.percentage.description', categoryKey: 'intelligenceCatalog.categories.numeric' },
  { id: 'latitude', labelKey: 'intelligenceCatalog.mock.latitude.label', descriptionKey: 'intelligenceCatalog.mock.latitude.description', categoryKey: 'intelligenceCatalog.categories.geographic' },
  { id: 'longitude', labelKey: 'intelligenceCatalog.mock.longitude.label', descriptionKey: 'intelligenceCatalog.mock.longitude.description', categoryKey: 'intelligenceCatalog.categories.geographic' },
  { id: 'coordinate', labelKey: 'intelligenceCatalog.mock.coordinate.label', descriptionKey: 'intelligenceCatalog.mock.coordinate.description', categoryKey: 'intelligenceCatalog.categories.geographic' },
  { id: 'plate-tr', labelKey: 'intelligenceCatalog.mock.plate-tr.label', descriptionKey: 'intelligenceCatalog.mock.plate-tr.description', categoryKey: 'intelligenceCatalog.categories.identity' },
  { id: 'sentence', labelKey: 'intelligenceCatalog.mock.sentence.label', descriptionKey: 'intelligenceCatalog.mock.sentence.description', categoryKey: 'intelligenceCatalog.categories.text' },
  { id: 'paragraph', labelKey: 'intelligenceCatalog.mock.paragraph.label', descriptionKey: 'intelligenceCatalog.mock.paragraph.description', categoryKey: 'intelligenceCatalog.categories.text' },
  { id: 'slug', labelKey: 'intelligenceCatalog.mock.slug.label', descriptionKey: 'intelligenceCatalog.mock.slug.description', categoryKey: 'intelligenceCatalog.categories.text' },
  { id: 'hex', labelKey: 'intelligenceCatalog.mock.hex.label', descriptionKey: 'intelligenceCatalog.mock.hex.description', categoryKey: 'intelligenceCatalog.categories.technical' },
  { id: 'color', labelKey: 'intelligenceCatalog.mock.color.label', descriptionKey: 'intelligenceCatalog.mock.color.description', categoryKey: 'intelligenceCatalog.categories.technical' },
  { id: 'json-object', labelKey: 'intelligenceCatalog.mock.json-object.label', descriptionKey: 'intelligenceCatalog.mock.json-object.description', categoryKey: 'intelligenceCatalog.categories.technical' },
  { id: 'enum', labelKey: 'intelligenceCatalog.mock.enum.label', descriptionKey: 'intelligenceCatalog.mock.enum.description', categoryKey: 'intelligenceCatalog.categories.general' },
  { id: 'constant', labelKey: 'intelligenceCatalog.mock.constant.label', descriptionKey: 'intelligenceCatalog.mock.constant.description', categoryKey: 'intelligenceCatalog.categories.general' },
  { id: 'null', labelKey: 'intelligenceCatalog.mock.null.label', descriptionKey: 'intelligenceCatalog.mock.null.description', categoryKey: 'intelligenceCatalog.categories.general' }
];

export interface MockColumnRule {
  column: string;
  kind: MockDataKind;
  nullablePercent?: number;
  min?: number;
  max?: number;
  decimals?: number;
  values?: string[];
  constant?: string;
}

export interface DataQualityIssue {
  id: string;
  column: string;
  severity: 'info' | 'warning' | 'error';
  type: 'null-rate' | 'empty' | 'duplicate' | 'format' | 'whitespace' | 'outlier' | 'type' | 'length';
  message: string;
  affected: number;
  sample: unknown[];
}

export interface DataQualityReport {
  score: number;
  rows: number;
  columns: number;
  issues: DataQualityIssue[];
  summaries: Array<{ column: string; nulls: number; empty: number; distinct: number; duplicates: number; min?: number; max?: number; average?: number }>;
}

export interface QueryProfile {
  fingerprint: string;
  sampleSql: string;
  count: number;
  errors: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  totalMs: number;
  rows: number;
  lastAt: string;
  serverId?: string;
  databaseName?: string;
}

export interface HealthFactor {
  id: string;
  label: string;
  score: number;
  maximum: number;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  message: string;
}

export interface HealthScore {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: HealthFactor[];
}

export interface QuerySnippet {
  id: string;
  title: string;
  description: string;
  category: string;
  engines: Array<DatabaseEngine | 'all'>;
  sql: string;
  tags: string[];
  risk: 'read' | 'write' | 'admin';
  featured?: boolean;
}

export interface PerformanceHistoryPoint {
  id: string;
  serverId: string;
  sampledAt: string;
  qps: number;
  slowQueries: number;
  connections: number;
  running: number;
  bytesReceived: number;
  bytesSent: number;
  bufferUsage: number;
  replicationLag: number | null;
  storageBytes: number;
  healthScore?: number;
}

export interface NotificationRule {
  id: string;
  name: string;
  metric: 'connection-percent' | 'running-threads' | 'slow-query-delta' | 'buffer-usage' | 'replication-lag' | 'server-unreachable' | 'health-score';
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  threshold: number;
  enabled: boolean;
  severity: 'neutral' | 'warning' | 'error' | 'danger' | 'primary';
  cooldownSeconds: number;
}

const NAMES = ['Ahmet', 'Ayşe', 'Mehmet', 'Elif', 'Can', 'Zeynep', 'Deniz', 'Ece', 'Mert', 'Selin', 'Bahattin', 'İrem', 'Berk', 'Ceren'];
const SURNAMES = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Arslan', 'Koç', 'Kurt', 'Öztürk'];
const CITIES = ['Ankara', 'İstanbul', 'İzmir', 'Bursa', 'Antalya', 'Eskişehir', 'Konya', 'Samsun', 'Adana', 'Mersin'];
const DISTRICTS = ['Çankaya', 'Sincan', 'Kadıköy', 'Bornova', 'Nilüfer', 'Muratpaşa', 'Odunpazarı', 'Selçuklu'];
const COMPANIES = ['Coreor Teknoloji', 'Atlas Yazılım', 'Nova Lojistik', 'Pusula Veri', 'Kuzey Sistemler', 'Mavi Bulut'];
const JOBS = ['Backend Developer', 'DBA', 'Data Analyst', 'Product Manager', 'DevOps Engineer', 'Support Specialist'];
const COUNTRIES = ['Türkiye', 'Almanya', 'Fransa', 'İtalya', 'İspanya', 'Hollanda', 'Birleşik Krallık'];
const WORDS = ['veri', 'sistem', 'kullanıcı', 'işlem', 'güvenli', 'hızlı', 'analiz', 'platform', 'sunucu', 'uygulama', 'tablo', 'sorgu'];

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seeded(seed: number) {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function pick<T>(values: T[], random: () => number) { return values[Math.floor(random() * values.length)] ?? values[0]; }
function stars(length: number) { return '*'.repeat(Math.max(3, Math.min(32, length))); }
function stableHex(value: string, length = 16) {
  const base = hashText(value).toString(16).padStart(8, '0');
  return (base + hashText(`${value}:salt`).toString(16).padStart(8, '0')).repeat(Math.ceil(length / 16)).slice(0, length);
}

export function maskValueAdvanced(value: unknown, kind: MaskKind): unknown {
  if (kind === 'null') return null;
  const text = value === null || value === undefined ? '' : String(value);
  if (!text) return text;
  if (kind === 'redact' || kind === 'password') return stars(text.length);
  if (kind === 'keep-first-2') return `${text.slice(0, 2)}${stars(text.length - 2)}`;
  if (kind === 'keep-last-4') return `${stars(text.length - 4)}${text.slice(-4)}`;
  if (kind === 'hash') return `hash_${stableHex(text, 20)}`;
  if (kind === 'email') { const [name = '', domain = 'example.com'] = text.split('@'); return `${name.slice(0, 1)}${stars(Math.max(3, name.length - 1))}@${domain}`; }
  if (kind === 'phone') { const digits = text.replace(/\D/g, ''); return digits.length > 4 ? `${text.startsWith('+') ? '+' : ''}${digits.slice(0, 2)}${stars(digits.length - 4)}${digits.slice(-2)}` : stars(text.length); }
  if (kind === 'tc') return `${text.slice(0, 2)}${stars(Math.max(7, text.length - 4))}${text.slice(-2)}`;
  if (kind === 'address') return `${text.split(/\s+/)[0]} … [adres maskeli]`;
  if (kind === 'iban') { const compact = text.replace(/\s/g, ''); return `${compact.slice(0, 4)} ${stars(Math.max(8, compact.length - 8))} ${compact.slice(-4)}`; }
  if (kind === 'credit-card') { const digits = text.replace(/\D/g, ''); return `${digits.slice(0, 6)}${stars(Math.max(6, digits.length - 10))}${digits.slice(-4)}`; }
  if (kind === 'first-name' || kind === 'last-name') return `${text.slice(0, 1)}${stars(text.length - 1)}`;
  if (kind === 'full-name') return text.split(/\s+/).map(part => `${part.slice(0, 1)}${stars(part.length - 1)}`).join(' ');
  if (kind === 'username') return text.length <= 3 ? stars(text.length) : `${text.slice(0, 2)}${stars(text.length - 3)}${text.slice(-1)}`;
  if (kind === 'company') return `Anonim Şirket ${stableHex(text, 4).toUpperCase()}`;
  if (kind === 'city') return `Bölge-${hashText(text) % 20 + 1}`;
  if (kind === 'country') return `Ülke-${hashText(text) % 12 + 1}`;
  if (kind === 'postal-code') return `${text.slice(0, 2)}${stars(text.length - 2)}`;
  if (kind === 'url') { try { const url = new URL(text); return `${url.protocol}//masked-${stableHex(url.host, 6)}.example/…`; } catch { return 'https://masked.example/…'; } }
  if (kind === 'domain') { const parts = text.split('.'); return `masked-${stableHex(text, 6)}.${parts.at(-1) || 'com'}`; }
  if (kind === 'ipv4') { const parts = text.split('.'); return `${parts[0] || '192'}.${parts[1] || '0'}.x.x`; }
  if (kind === 'ipv6') { const parts = text.split(':'); return `${parts[0] || '2001'}:${parts[1] || 'db8'}:****:****:****:****:****:****`; }
  if (kind === 'mac') { const parts = text.split(':'); return `${parts.slice(0, 3).join(':') || '02:00:00'}:**:**:**`; }
  if (kind === 'uuid') { const hex = stableHex(text, 32); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`; }
  if (kind === 'snowflake') return BigInt(hashText(text)) * 4194304n + 1420070400000n;
  if (kind === 'token') return `${text.slice(0, Math.min(6, text.length))}.${stars(12)}.${text.slice(-4)}`;
  if (kind === 'api-key') return `${text.slice(0, 4)}${stars(Math.max(8, text.length - 8))}${text.slice(-4)}`;
  if (kind === 'date' || kind === 'datetime' || kind === 'birthdate') { const date = new Date(text); if (Number.isNaN(date.getTime())) return '****-**-**'; const year = date.getUTCFullYear(); const month = kind === 'birthdate' ? '01' : String(date.getUTCMonth() + 1).padStart(2, '0'); return kind === 'datetime' ? `${year}-${month}-01T00:00:00Z` : `${year}-${month}-01`; }
  if (kind === 'amount') { const numeric = Number(text.replace(/[^0-9.-]/g, '')); if (!Number.isFinite(numeric)) return '***'; const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(numeric) || 1)) - 1); return Math.round(numeric / magnitude) * magnitude; }
  if (kind === 'currency') return text.replace(/[0-9]/g, '*');
  if (kind === 'percentage') { const numeric = Number(text.replace(/[^0-9.-]/g, '')); return Number.isFinite(numeric) ? `${Math.round(numeric / 5) * 5}%` : '**%'; }
  if (kind === 'latitude' || kind === 'longitude') { const numeric = Number(text); return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : '0.00'; }
  if (kind === 'coordinate') return text.split(',').map(item => { const numeric = Number(item.trim()); return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00'; }).join(', ');
  if (kind === 'plate-tr') return `${text.slice(0, 2)} ${stars(Math.max(3, text.length - 2))}`;
  if (kind === 'serial') return `${text.slice(0, 3)}-${stableHex(text, Math.max(6, text.length - 3)).toUpperCase()}`;
  return stars(text.length);
}

function luhnDigit(prefix: string) {
  let sum = 0; let parity = (prefix.length + 1) % 2;
  for (let index = 0; index < prefix.length; index += 1) {
    let digit = Number(prefix[index]);
    if (index % 2 === parity) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  }
  return String((10 - sum % 10) % 10);
}

function validTc(random: () => number) {
  const digits = [Math.floor(random() * 9) + 1];
  for (let index = 1; index < 9; index += 1) digits.push(Math.floor(random() * 10));
  digits[9] = ((digits[0] + digits[2] + digits[4] + digits[6] + digits[8]) * 7 - (digits[1] + digits[3] + digits[5] + digits[7])) % 10;
  if (digits[9] < 0) digits[9] += 10;
  digits[10] = digits.slice(0, 10).reduce((sum, digit) => sum + digit, 0) % 10;
  return digits.join('');
}

function ibanCheckDigits(country: string, bban: string) {
  const converted = `${bban}${country.split('').map(char => char.charCodeAt(0) - 55).join('')}00`;
  let remainder = 0;
  for (const char of converted) remainder = (remainder * 10 + Number(char)) % 97;
  return String(98 - remainder).padStart(2, '0');
}

function ulid(random: () => number, timestamp: number) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let time = BigInt(timestamp); let timePart = '';
  for (let index = 0; index < 10; index += 1) { timePart = alphabet[Number(time % 32n)] + timePart; time /= 32n; }
  let randomPart = ''; for (let index = 0; index < 16; index += 1) randomPart += alphabet[Math.floor(random() * alphabet.length)];
  return `${timePart}${randomPart}`;
}

function generateValue(rule: MockColumnRule, rowIndex: number, random: () => number, seed: number): unknown {
  if ((rule.nullablePercent || 0) > random() * 100) return null;
  const min = rule.min ?? 1; const max = rule.max ?? 10000;
  const name = pick(NAMES, random); const surname = pick(SURNAMES, random);
  const now = Date.now() - Math.floor(random() * 365 * 24 * 3600 * 1000);
  switch (rule.kind) {
    case 'sequential-id': return min + rowIndex;
    case 'snowflake-id': { const epoch = 1420070400000n; const timestamp = BigInt(Date.now() + rowIndex - Number(epoch)); const worker = BigInt(seed % 1024); return ((timestamp << 22n) | (worker << 12n) | BigInt(rowIndex % 4096)).toString(); }
    case 'uuid': { const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16)).join(''); return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${['8','9','a','b'][Math.floor(random()*4)]}${hex.slice(17,20)}-${hex.slice(20)}`; }
    case 'ulid': return ulid(random, Date.now() + rowIndex);
    case 'integer': return Math.floor(min + random() * (max - min + 1));
    case 'bigint': return String(BigInt(Math.floor(min + random() * (max - min + 1))) * 1000000n + BigInt(rowIndex));
    case 'decimal': return Number((min + random() * (max - min)).toFixed(rule.decimals ?? 2));
    case 'boolean': return random() >= 0.5;
    case 'first-name': return name;
    case 'last-name': return surname;
    case 'full-name': return `${name} ${surname}`;
    case 'username': return `${name.toLocaleLowerCase('tr-TR').replace(/ı/g,'i')}.${surname.toLocaleLowerCase('tr-TR').replace(/ı/g,'i')}${rowIndex + 1}`;
    case 'email': return `${name.toLocaleLowerCase('tr-TR').replace(/ı/g,'i')}.${surname.toLocaleLowerCase('tr-TR').replace(/ı/g,'i')}${rowIndex + 1}@example.test`;
    case 'phone-tr': return `+90 5${Math.floor(10 + random() * 89)} ${Math.floor(100 + random() * 899)} ${Math.floor(10 + random() * 89)} ${Math.floor(10 + random() * 89)}`;
    case 'phone-intl': return `+${pick(['1','44','49','33','39'], random)} ${Math.floor(100000000 + random() * 899999999)}`;
    case 'tc': return validTc(random);
    case 'iban-tr': { const bban = `00061${String(Math.floor(random() * 10 ** 16)).padStart(16,'0')}${String(rowIndex % 100000).padStart(5,'0')}`.slice(0,22); return `TR${ibanCheckDigits('TR', bban)}${bban}`; }
    case 'credit-card-test': { const prefix = `424242424242${String(rowIndex % 1000).padStart(3,'0')}`; return `${prefix}${luhnDigit(prefix)}`; }
    case 'company': return pick(COMPANIES, random);
    case 'job-title': return pick(JOBS, random);
    case 'address-tr': return `${pick(['Atatürk','Cumhuriyet','Bahçelievler','Yeni'], random)} Mah. ${pick(['Gül','Çınar','İnönü','Mevlana'], random)} Cad. No:${Math.floor(random()*150)+1} ${pick(DISTRICTS,random)}/${pick(CITIES,random)}`;
    case 'city-tr': return pick(CITIES, random);
    case 'district-tr': return pick(DISTRICTS, random);
    case 'country': return pick(COUNTRIES, random);
    case 'postal-code': return String(Math.floor(10000 + random() * 89999));
    case 'url': return `https://example.test/${pick(WORDS, random)}/${rowIndex + 1}`;
    case 'domain': return `${pick(WORDS, random)}-${rowIndex + 1}.example`;
    case 'ipv4': return `192.0.2.${rowIndex % 254 + 1}`;
    case 'ipv6': return `2001:db8:${(seed % 65535).toString(16)}::${(rowIndex + 1).toString(16)}`;
    case 'mac': return `02:${Array.from({length:5},()=>Math.floor(random()*256).toString(16).padStart(2,'0')).join(':')}`;
    case 'date': return new Date(now).toISOString().slice(0, 10);
    case 'datetime': return new Date(now).toISOString().replace('T', ' ').slice(0, 19);
    case 'birthdate': { const age = 18 + Math.floor(random() * 63); const date = new Date(); date.setUTCFullYear(date.getUTCFullYear() - age); date.setUTCDate(1 + Math.floor(random() * 27)); date.setUTCMonth(Math.floor(random() * 12)); return date.toISOString().slice(0,10); }
    case 'unix-timestamp': return Math.floor(now / 1000);
    case 'amount': return Number((1 + random() * 100000).toFixed(2));
    case 'currency-code': return pick(['TRY','USD','EUR','GBP','CHF'], random);
    case 'percentage': return Number((random() * 100).toFixed(2));
    case 'latitude': return Number((-90 + random() * 180).toFixed(6));
    case 'longitude': return Number((-180 + random() * 360).toFixed(6));
    case 'coordinate': return `${(-90 + random()*180).toFixed(6)},${(-180 + random()*360).toFixed(6)}`;
    case 'plate-tr': return `${String(Math.floor(random()*81)+1).padStart(2,'0')} ${String.fromCharCode(65+Math.floor(random()*26))}${String.fromCharCode(65+Math.floor(random()*26))} ${Math.floor(100+random()*899)}`;
    case 'sentence': return `${pick(WORDS,random)} ${pick(WORDS,random)} ${pick(WORDS,random)} ${pick(WORDS,random)}.`;
    case 'paragraph': return Array.from({length:3},()=>`${pick(WORDS,random)} ${pick(WORDS,random)} ${pick(WORDS,random)} ${pick(WORDS,random)}.`).join(' ');
    case 'slug': return `${pick(WORDS,random)}-${pick(WORDS,random)}-${rowIndex+1}`;
    case 'hex': return stableHex(`${seed}:${rowIndex}:${rule.column}`, 24);
    case 'color': return `#${stableHex(`${seed}:${rowIndex}`, 6)}`;
    case 'json-object': return { id: rowIndex + 1, active: random() > 0.2, label: pick(WORDS, random) };
    case 'enum': return pick(rule.values?.length ? rule.values : ['active','passive','pending'], random);
    case 'constant': return rule.constant ?? '';
    case 'null': return null;
  }
}

export function generateMockRows(rules: MockColumnRule[], count: number, seedText = 'coreor'): Record<string, unknown>[] {
  const seed = hashText(seedText);
  return Array.from({ length: Math.max(1, Math.min(10000, count)) }, (_, rowIndex) => {
    const random = seeded(seed + rowIndex * 2654435761);
    return Object.fromEntries(rules.map(rule => [rule.column, generateValue(rule, rowIndex, random, seed)]));
  });
}

export function inferMockKind(column: Pick<TableColumnInfo, 'Field' | 'Type' | 'Key'>): MockDataKind {
  const name = column.Field.toLocaleLowerCase('tr-TR'); const type = column.Type.toLocaleLowerCase('tr-TR');
  if (name.includes('snowflake')) return 'snowflake-id';
  if (name === 'id' || name.endsWith('_id')) return /bigint/.test(type) ? 'snowflake-id' : 'sequential-id';
  if (name.includes('uuid')) return 'uuid';
  if (name.includes('email')) return 'email';
  if (name.includes('phone') || name.includes('telefon')) return 'phone-tr';
  if (name === 'tc' || name.includes('identity')) return 'tc';
  if (name.includes('iban')) return 'iban-tr';
  if (name.includes('card')) return 'credit-card-test';
  if (name.includes('first_name') || name === 'name' || name === 'ad') return 'first-name';
  if (name.includes('last_name') || name === 'surname' || name === 'soyad') return 'last-name';
  if (name.includes('full_name')) return 'full-name';
  if (name.includes('username')) return 'username';
  if (name.includes('address') || name.includes('adres')) return 'address-tr';
  if (name.includes('city') || name.includes('sehir')) return 'city-tr';
  if (name.includes('company')) return 'company';
  if (name.includes('url')) return 'url';
  if (name.includes('ip')) return 'ipv4';
  if (name.includes('date') || name.endsWith('_at') || /date|time/.test(type)) return name.includes('birth') ? 'birthdate' : 'datetime';
  if (/bool|tinyint\(1\)/.test(type)) return 'boolean';
  if (/decimal|numeric|float|double/.test(type)) return 'decimal';
  if (/int|bigint/.test(type)) return 'integer';
  if (/json/.test(type)) return 'json-object';
  if (/text/.test(type)) return 'sentence';
  return 'constant';
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] || 0;
}

export function normalizeSqlFingerprint(sql: string) {
  return sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:''|[^'])*'/g, '?')
    .replace(/\b\d+(?:\.\d+)?\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function profileActivities(entries: ActivityEntry[], serverId?: string | null): QueryProfile[] {
  const groups = new Map<string, ActivityEntry[]>();
  for (const entry of entries) {
    if (serverId && entry.serverId !== serverId) continue;
    if (!entry.sql || entry.sql.startsWith('/* structured:')) continue;
    const fingerprint = normalizeSqlFingerprint(entry.sql);
    if (!fingerprint) continue;
    groups.set(fingerprint, [...(groups.get(fingerprint) || []), entry]);
  }
  return [...groups.entries()].map(([fingerprint, group]) => {
    const durations = group.map(item => item.durationMs).filter((value): value is number => Number.isFinite(value));
    const total = durations.reduce((sum,value)=>sum+value,0);
    const latest = [...group].sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];
    return {
      fingerprint,
      sampleSql: latest.sql,
      count: group.length,
      errors: group.filter(item => item.level === 'error').length,
      averageMs: durations.length ? total / durations.length : 0,
      p50Ms: percentile(durations, .5),
      p95Ms: percentile(durations, .95),
      maxMs: Math.max(0, ...durations),
      totalMs: total,
      rows: group.reduce((sum,item)=>sum+(item.rowCount || item.affectedRows || 0),0),
      lastAt: latest.timestamp,
      serverId: latest.serverId,
      databaseName: latest.databaseName
    };
  }).sort((a,b)=>b.totalMs-a.totalMs);
}

export function analyzeDataQuality(rows: Record<string, unknown>[]): DataQualityReport {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const issues: DataQualityIssue[] = [];
  const summaries = columns.map(column => {
    const values = rows.map(row => row[column]);
    const nulls = values.filter(value => value === null || value === undefined).length;
    const empty = values.filter(value => typeof value === 'string' && !value.trim()).length;
    const normalized = values.filter(value => value !== null && value !== undefined).map(value => typeof value === 'object' ? JSON.stringify(value) : String(value));
    const distinct = new Set(normalized).size;
    const duplicates = Math.max(0, normalized.length - distinct);
    const numeric = values.map(Number).filter(Number.isFinite);
    const sample = values.filter(value => value !== null && value !== undefined).slice(0, 5);
    if (rows.length && nulls / rows.length > .2) issues.push({ id:`${column}:null`, column, severity:nulls / rows.length > .5 ? 'error':'warning', type:'null-rate', message:`NULL oranı %${Math.round(nulls/rows.length*100)}.`, affected:nulls, sample });
    if (empty) issues.push({ id:`${column}:empty`, column, severity:'warning', type:'empty', message:'Boş string değerleri bulundu.', affected:empty, sample });
    if (duplicates > Math.max(5, rows.length * .5) && /(^id$|_id$|email|username|code|sku)/i.test(column)) issues.push({ id:`${column}:dup`, column, severity:'error', type:'duplicate', message:'Benzersiz olması beklenen kolonda tekrarlar var.', affected:duplicates, sample });
    const whitespace = values.filter(value => typeof value === 'string' && value !== value.trim()).length;
    if (whitespace) issues.push({ id:`${column}:space`, column, severity:'warning', type:'whitespace', message:'Başında veya sonunda boşluk bulunan değerler var.', affected:whitespace, sample });
    const invalidEmail = /email/i.test(column) ? values.filter(value => value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))).length : 0;
    if (invalidEmail) issues.push({ id:`${column}:email`, column, severity:'error', type:'format', message:'Geçersiz e-posta biçimleri bulundu.', affected:invalidEmail, sample });
    const invalidPhone = /(phone|telefon|mobile)/i.test(column) ? values.filter(value => value && String(value).replace(/\D/g,'').length < 10).length : 0;
    if (invalidPhone) issues.push({ id:`${column}:phone`, column, severity:'warning', type:'format', message:'Kısa veya geçersiz telefon değerleri bulundu.', affected:invalidPhone, sample });
    const longValues = values.filter(value => typeof value === 'string' && value.length > 5000).length;
    if (longValues) issues.push({ id:`${column}:length`, column, severity:'info', type:'length', message:'5.000 karakterden uzun metinler bulundu.', affected:longValues, sample });
    if (numeric.length >= 8) {
      const average = numeric.reduce((sum,value)=>sum+value,0)/numeric.length;
      const deviation = Math.sqrt(numeric.reduce((sum,value)=>sum+(value-average)**2,0)/numeric.length);
      const outliers = numeric.filter(value => Math.abs(value-average) > deviation*3).length;
      if (outliers) issues.push({ id:`${column}:outlier`, column, severity:'warning', type:'outlier', message:'Üç standart sapmanın dışında sayısal değerler var.', affected:outliers, sample });
      return { column, nulls, empty, distinct, duplicates, min:Math.min(...numeric), max:Math.max(...numeric), average };
    }
    return { column, nulls, empty, distinct, duplicates };
  });
  const penalty = issues.reduce((sum,issue)=>sum+(issue.severity==='error'?12:issue.severity==='warning'?6:2),0);
  return { score:Math.max(0,100-Math.min(100,penalty)), rows:rows.length, columns:columns.length, issues, summaries };
}

export function calculateHealthScore(snapshot: DatabasePerformanceSnapshot | null, activities: ActivityEntry[], backupAgeHours?: number | null): HealthScore {
  const factors: HealthFactor[] = [];
  const add = (factor: HealthFactor) => factors.push(factor);
  if (!snapshot) add({ id:'snapshot', label:'Sunucu ölçümü', score:0, maximum:20, status:'unknown', message:'Canlı snapshot alınamadı.' });
  else {
    const connectionPercent = snapshot.maxConnections ? snapshot.threadsConnected/snapshot.maxConnections*100 : 0;
    add({ id:'connections', label:'Bağlantı kapasitesi', score:connectionPercent<65?15:connectionPercent<85?9:2, maximum:15, status:connectionPercent<65?'healthy':connectionPercent<85?'warning':'critical', message:`%${connectionPercent.toFixed(1)} bağlantı kullanımı.` });
    const buffer = snapshot.bufferPool.usagePercent;
    add({ id:'buffer', label:'Buffer pool', score:buffer<90?15:buffer<97?10:4, maximum:15, status:buffer<90?'healthy':buffer<97?'warning':'critical', message:`%${buffer.toFixed(1)} kullanım, dirty %${snapshot.bufferPool.dirtyPercent.toFixed(1)}.` });
    const lag = snapshot.replication.secondsBehind;
    add({ id:'replication', label:'Replikasyon', score:!snapshot.replication.available?8:lag===null?8:lag<10?15:lag<60?8:1, maximum:15, status:!snapshot.replication.available?'unknown':lag!==null&&lag>=60?'critical':lag!==null&&lag>=10?'warning':'healthy', message:!snapshot.replication.available?'Replica bilgisi yok.':`${lag ?? '—'} saniye gecikme.` });
    add({ id:'threads', label:'Çalışan sorgular', score:snapshot.threadsRunning<10?10:snapshot.threadsRunning<30?6:1, maximum:10, status:snapshot.threadsRunning<10?'healthy':snapshot.threadsRunning<30?'warning':'critical', message:`${snapshot.threadsRunning} çalışan thread.` });
    add({ id:'slow', label:'Slow query sayacı', score:snapshot.slowQueries===0?10:snapshot.slowQueries<100?7:3, maximum:10, status:snapshot.slowQueries===0?'healthy':snapshot.slowQueries<100?'warning':'critical', message:`${snapshot.slowQueries.toLocaleString('tr-TR')} global slow query.` });
  }
  const relevant = activities.filter(item => item.durationMs !== undefined).slice(-100);
  const errors = relevant.filter(item => item.level==='error').length;
  const slow = relevant.filter(item => (item.durationMs||0)>=1000).length;
  add({ id:'queries', label:'Yerel sorgu başarısı', score:errors===0&&slow<5?15:errors<5&&slow<20?9:3, maximum:15, status:errors===0&&slow<5?'healthy':errors<5?'warning':'critical', message:`Son ${relevant.length} sorguda ${errors} hata, ${slow} yavaş sorgu.` });
  if (backupAgeHours === null || backupAgeHours === undefined) add({ id:'backup', label:'Yedek güncelliği', score:5, maximum:15, status:'unknown', message:'Tamamlanan yedek kaydı yok.' });
  else add({ id:'backup', label:'Yedek güncelliği', score:backupAgeHours<24?15:backupAgeHours<72?9:2, maximum:15, status:backupAgeHours<24?'healthy':backupAgeHours<72?'warning':'critical', message:`Son yedek ${Math.round(backupAgeHours)} saat önce.` });
  const score = Math.round(factors.reduce((sum,factor)=>sum+factor.score,0)/Math.max(1,factors.reduce((sum,factor)=>sum+factor.maximum,0))*100);
  return { score, grade:score>=90?'A':score>=80?'B':score>=65?'C':score>=50?'D':'F', factors };
}

function readLocal<T>(key:string, fallback:T):T { if(typeof window==='undefined') return fallback; try { const value=JSON.parse(localStorage.getItem(key)||'null'); return value??fallback; } catch { return fallback; } }
function writeLocal<T>(key:string,value:T) { if(typeof window==='undefined') return; localStorage.setItem(key,JSON.stringify(value)); window.dispatchEvent(new CustomEvent('coreor:intelligence-store-changed',{detail:{key}})); }

const HISTORY_KEY='coreor:performance-history:v1';
const RULES_KEY='coreor:notification-rules:v1';
export const DEFAULT_NOTIFICATION_RULES: NotificationRule[] = [
  { id:'connections', name:'Bağlantı kullanımı yüksek', metric:'connection-percent', operator:'gte', threshold:80, enabled:true, severity:'warning', cooldownSeconds:300 },
  { id:'running', name:'Çalışan thread sayısı yüksek', metric:'running-threads', operator:'gte', threshold:25, enabled:true, severity:'warning', cooldownSeconds:180 },
  { id:'slow', name:'Yeni slow query algılandı', metric:'slow-query-delta', operator:'gt', threshold:0, enabled:true, severity:'warning', cooldownSeconds:120 },
  { id:'buffer', name:'Buffer pool kritik doluluk', metric:'buffer-usage', operator:'gte', threshold:97, enabled:true, severity:'danger', cooldownSeconds:300 },
  { id:'replication', name:'Replication gecikmesi', metric:'replication-lag', operator:'gte', threshold:30, enabled:true, severity:'error', cooldownSeconds:180 },
  { id:'unreachable', name:'Sunucuya ulaşılamıyor', metric:'server-unreachable', operator:'eq', threshold:1, enabled:true, severity:'error', cooldownSeconds:120 },
  { id:'health', name:'Sağlık skoru düştü', metric:'health-score', operator:'lt', threshold:70, enabled:true, severity:'primary', cooldownSeconds:600 }
];

export const performanceHistoryStore = {
  list(serverId?:string) { const values=readLocal<PerformanceHistoryPoint[]>(HISTORY_KEY,[]); return serverId?values.filter(item=>item.serverId===serverId):values; },
  add(point:PerformanceHistoryPoint) { const values=[...readLocal<PerformanceHistoryPoint[]>(HISTORY_KEY,[]),point].filter(item=>Date.now()-new Date(item.sampledAt).getTime()<7*24*3600*1000).slice(-10000); writeLocal(HISTORY_KEY,values); },
  clear(serverId?:string) { const values=readLocal<PerformanceHistoryPoint[]>(HISTORY_KEY,[]); writeLocal(HISTORY_KEY,serverId?values.filter(item=>item.serverId!==serverId):[]); }
};
export const notificationRuleStore = {
  list() { return readLocal<NotificationRule[]>(RULES_KEY,DEFAULT_NOTIFICATION_RULES); },
  save(rules:NotificationRule[]) { writeLocal(RULES_KEY,rules); },
  reset() { writeLocal(RULES_KEY,DEFAULT_NOTIFICATION_RULES); }
};

export function compareMetric(value:number,operator:NotificationRule['operator'],threshold:number) {
  if(operator==='gt') return value>threshold; if(operator==='gte') return value>=threshold; if(operator==='lt') return value<threshold; if(operator==='lte') return value<=threshold; return value===threshold;
}

export const QUERY_SNIPPETS: QuerySnippet[] = [
  { id:'generic-table-counts', title:'Tablo satır sayıları', description:'Seçili şemadaki tabloların tahmini satır sayılarını listeler.', category:'Katalog', engines:['mysql','mariadb','tidb'], risk:'read', featured:true, tags:['tables','rows','catalog'], sql:`SELECT TABLE_NAME, TABLE_ROWS\nFROM information_schema.TABLES\nWHERE TABLE_SCHEMA = DATABASE()\nORDER BY TABLE_ROWS DESC;` },
  { id:'mysql-large-tables', title:'En büyük tablolar', description:'Veri ve indeks boyutuna göre sıralar.', category:'Depolama', engines:['mysql','mariadb','tidb'], risk:'read', tags:['size','storage'], sql:`SELECT TABLE_SCHEMA, TABLE_NAME,\nROUND((DATA_LENGTH+INDEX_LENGTH)/1024/1024,2) AS total_mb\nFROM information_schema.TABLES\nORDER BY total_mb DESC\nLIMIT 50;` },
  { id:'mysql-unused-indexes', title:'Kullanılmayan indeks adayları', description:'Performance Schema istatistiklerinden adayları bulur.', category:'İndeks', engines:['mysql','mariadb'], risk:'read', tags:['index','performance'], sql:`SELECT OBJECT_SCHEMA, OBJECT_NAME, INDEX_NAME\nFROM performance_schema.table_io_waits_summary_by_index_usage\nWHERE INDEX_NAME IS NOT NULL AND COUNT_STAR = 0\nORDER BY OBJECT_SCHEMA, OBJECT_NAME;` },
  { id:'mysql-locks', title:'InnoDB kilit beklemeleri', description:'Aktif lock wait kayıtlarını gösterir.', category:'Kilit', engines:['mysql','mariadb'], risk:'read', tags:['locks','innodb'], sql:`SELECT * FROM performance_schema.data_lock_waits;` },
  { id:'mysql-connection-summary', title:'Bağlantı özeti', description:'Aktif kullanıcı ve host dağılımı.', category:'Bağlantı', engines:['mysql','mariadb','tidb'], risk:'read', tags:['process','users'], sql:`SELECT USER, HOST, COMMAND, COUNT(*) AS connections\nFROM information_schema.PROCESSLIST\nGROUP BY USER, HOST, COMMAND\nORDER BY connections DESC;` },
  { id:'pg-large-tables', title:'PostgreSQL büyük tablolar', description:'Toplam ilişki boyutlarını listeler.', category:'Depolama', engines:['postgresql','cockroachdb'], risk:'read', featured:true, tags:['postgres','size'], sql:`SELECT schemaname, relname,\npg_size_pretty(pg_total_relation_size(relid)) AS total_size\nFROM pg_catalog.pg_statio_user_tables\nORDER BY pg_total_relation_size(relid) DESC\nLIMIT 50;` },
  { id:'pg-long-queries', title:'Uzun PostgreSQL sorguları', description:'30 saniyeyi geçen aktif sorgular.', category:'Performans', engines:['postgresql','cockroachdb'], risk:'read', tags:['slow','activity'], sql:`SELECT pid, usename, now()-query_start AS duration, state, query\nFROM pg_stat_activity\nWHERE state <> 'idle' AND now()-query_start > interval '30 seconds'\nORDER BY duration DESC;` },
  { id:'pg-index-usage', title:'PostgreSQL indeks kullanımı', description:'Seq scan ve index scan oranlarını gösterir.', category:'İndeks', engines:['postgresql'], risk:'read', tags:['index','scan'], sql:`SELECT schemaname, relname, seq_scan, idx_scan,\nCASE WHEN seq_scan+idx_scan=0 THEN 0 ELSE idx_scan::numeric/(seq_scan+idx_scan) END AS index_ratio\nFROM pg_stat_user_tables\nORDER BY seq_scan DESC;` },
  { id:'pg-bloat-candidates', title:'VACUUM adayları', description:'Dead tuple oranı yüksek tablolar.', category:'Bakım', engines:['postgresql'], risk:'read', tags:['vacuum','dead tuples'], sql:`SELECT schemaname, relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum\nFROM pg_stat_user_tables\nORDER BY n_dead_tup DESC\nLIMIT 50;` },
  { id:'mssql-long-queries', title:'SQL Server uzun istekler', description:'Aktif request ve wait bilgileri.', category:'Performans', engines:['mssql'], risk:'read', featured:true, tags:['mssql','requests'], sql:`SELECT r.session_id, r.status, r.command, r.wait_type, r.total_elapsed_time, t.text\nFROM sys.dm_exec_requests r\nCROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t\nORDER BY r.total_elapsed_time DESC;` },
  { id:'mssql-index-fragmentation', title:'İndeks parçalanması', description:'Yeniden düzenleme veya rebuild adayları.', category:'İndeks', engines:['mssql'], risk:'read', tags:['fragmentation','index'], sql:`SELECT OBJECT_NAME(ips.object_id) AS table_name, i.name AS index_name,\nips.avg_fragmentation_in_percent, ips.page_count\nFROM sys.dm_db_index_physical_stats(DB_ID(),NULL,NULL,NULL,'LIMITED') ips\nJOIN sys.indexes i ON i.object_id=ips.object_id AND i.index_id=ips.index_id\nWHERE ips.page_count > 100\nORDER BY ips.avg_fragmentation_in_percent DESC;` },
  { id:'mssql-database-sizes', title:'SQL Server veritabanı boyutları', description:'Data ve log dosyalarının boyutunu gösterir.', category:'Depolama', engines:['mssql'], risk:'read', tags:['files','size'], sql:`SELECT DB_NAME(database_id) AS database_name, type_desc,\nSUM(size)*8.0/1024 AS size_mb\nFROM sys.master_files\nGROUP BY database_id,type_desc\nORDER BY size_mb DESC;` },
  { id:'generic-duplicate-values', title:'Tekrarlanan değerleri bul', description:'Kolon bazlı duplicate analizi şablonu.', category:'Veri Kalitesi', engines:['all'], risk:'read', tags:['duplicate','quality'], sql:`SELECT column_name, COUNT(*) AS duplicate_count\nFROM table_name\nGROUP BY column_name\nHAVING COUNT(*) > 1\nORDER BY duplicate_count DESC;` },
  { id:'generic-null-profile', title:'NULL profili', description:'Kolon için NULL ve toplam kayıt sayısını ölçer.', category:'Veri Kalitesi', engines:['all'], risk:'read', tags:['null','quality'], sql:`SELECT COUNT(*) AS total_rows,\nSUM(CASE WHEN column_name IS NULL THEN 1 ELSE 0 END) AS null_rows\nFROM table_name;` },
  { id:'generic-safe-update', title:'Güvenli UPDATE taslağı', description:'Transaction ve doğrulama SELECTi içeren yazma şablonu.', category:'Güvenli Yazma', engines:['all'], risk:'write', tags:['update','transaction'], sql:`BEGIN;\nSELECT * FROM table_name WHERE primary_key = 'value';\nUPDATE table_name SET column_name = 'new_value' WHERE primary_key = 'value';\n-- COMMIT; -- Sonucu doğruladıktan sonra açın\nROLLBACK;` }
];
