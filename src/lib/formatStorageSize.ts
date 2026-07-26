export function formatStorageBytes(bytes: number, locale = 'tr-TR') {
  const safeBytes = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
  let value = safeBytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unitIndex]}`;
}

export function formatStorageMb(megabytes: string | number | null | undefined, locale = 'tr-TR') {
  const mb = Number(megabytes ?? 0);
  if (!Number.isFinite(mb) || mb <= 0) return '0 B';
  const bytes = mb * 1024 * 1024;
  if (mb < 8) return formatStorageBytes(bytes, locale);
  return formatStorageBytes(bytes, locale);
}
