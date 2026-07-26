'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleDot, ExternalLink, FileClock, GitMerge, GitPullRequest, Loader2, RefreshCw, Search, ShieldCheck, Sparkles, Wrench, XCircle } from 'lucide-react';
import type { ReleaseHistoryResponse, ReleasePullRequest, ReleasePullRequestStatus } from '@/lib/releaseHistory';
import { Button } from '@/components/ui/button';

interface ReleaseNotesTreeProps {
  compact?: boolean;
  className?: string;
}

type DetailCategory = 'added' | 'changed' | 'fixed' | 'removed' | 'security' | 'notes';
type StatusFilter = 'all' | ReleasePullRequestStatus;

interface ParsedReleaseBody {
  added: string[];
  changed: string[];
  fixed: string[];
  removed: string[];
  security: string[];
  notes: string[];
}

const EMPTY_DETAILS: ParsedReleaseBody = {
  added: [],
  changed: [],
  fixed: [],
  removed: [],
  security: [],
  notes: []
};

const categoryConfig: Array<{
  key: DetailCategory;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}> = [
  { key: 'added', title: 'Gelenler', description: 'Yeni eklenen özellik ve yetenekler', icon: Sparkles, className: 'border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-300' },
  { key: 'changed', title: 'Değişenler', description: 'Davranışı veya görünümü yenilenen alanlar', icon: GitMerge, className: 'border-cyan-500/20 bg-cyan-500/[0.04] text-cyan-300' },
  { key: 'fixed', title: 'Düzeltilenler', description: 'Çözülen hatalar ve uyumluluk sorunları', icon: Wrench, className: 'border-amber-500/20 bg-amber-500/[0.04] text-amber-300' },
  { key: 'removed', title: 'Kaldırılanlar', description: 'Artık kullanılmayan veya yerini yenisine bırakan parçalar', icon: XCircle, className: 'border-red-500/20 bg-red-500/[0.04] text-red-300' },
  { key: 'security', title: 'Güvenlik ve koruma', description: 'Oturum, bağlantı ve veri güvenliğine ilişkin değişiklikler', icon: ShieldCheck, className: 'border-purple-500/20 bg-purple-500/[0.04] text-purple-300' },
  { key: 'notes', title: 'Bilmeniz gerekenler', description: 'Geçiş, sınır ve kullanım notları', icon: AlertTriangle, className: 'border-zinc-700 bg-zinc-900/35 text-zinc-300' }
];

function cleanMarkdownText(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/^>\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifySection(heading: string, text: string): DetailCategory {
  const value = `${heading} ${text}`.toLocaleLowerCase('tr-TR');
  if (/kaldır|çıkar|silindi|sona er|artık kullanılm|yerini .* bırak/.test(value)) return 'removed';
  if (/düzelt|hata|sorun|çözüm|uyumluluk|boşluk|çök|başarısız/.test(value)) return 'fixed';
  if (/güven|koruma|şifre|oturum|izin|allowlist|rate.?limit|parola/.test(heading.toLocaleLowerCase('tr-TR'))) return 'security';
  if (/bilinen|sınır|not|dağıtım|geçiş|doğrulama|test|kurulum|teknik|sonraki adım/.test(value)) return 'notes';
  if (/değiş|mimari|altyapı|arayüz|tasarım|performans|davranış|taşın|dönüştür/.test(value)) return 'changed';
  return 'added';
}

function parseReleaseBody(body: string): ParsedReleaseBody {
  if (!body.trim()) return EMPTY_DETAILS;
  const result: ParsedReleaseBody = { added: [], changed: [], fixed: [], removed: [], security: [], notes: [] };
  const dedupe = new Set<string>();
  const lines = body.replace(/```[\s\S]*?```/g, '\n').split('\n');
  let heading = 'Değişiklikler';
  let skipSection = false;

  const add = (raw: string) => {
    const text = cleanMarkdownText(raw.replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, ''));
    if (text.length < 12 || /^https?:\/\//i.test(text)) return;
    const normalized = text.toLocaleLowerCase('tr-TR');
    if (dedupe.has(normalized)) return;
    dedupe.add(normalized);
    result[classifySection(heading, text)].push(text);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      heading = cleanMarkdownText(headingMatch[1]);
      skipSection = /değişen dosya|dosyalar|komutlar|örnek env|kod değişiklikleri/i.test(heading);
      continue;
    }
    if (skipSection) continue;
    if (/^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) add(line);
    else if (line.length >= 45 && !/^(özet|değişiklikler|ana kapsam)$/i.test(line)) add(line);
  }

  return result;
}

function versionParts(version: string) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : [-1, -1, -1];
}

function compareVersions(left: string, right: string) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return b[index] - a[index];
  }
  return right.localeCompare(left, 'tr-TR');
}

function majorOf(version: string) {
  const match = version.match(/^(\d+)\./);
  return match ? `${match[1]}.x` : 'Sürümlendirilmemiş';
}

function formatDate(value: string | null) {
  if (!value) return 'Tarih yok';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value));
}

function statusInfo(status: ReleasePullRequestStatus, draft: boolean) {
  if (status === 'released') return { label: 'Yayınlandı', icon: CheckCircle2, className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' };
  if (status === 'in-progress') return { label: draft ? 'Taslak' : 'Hazırlanıyor', icon: FileClock, className: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300' };
  return { label: 'Birleşmeden kapatıldı', icon: XCircle, className: 'border-zinc-700 bg-zinc-900 text-zinc-400' };
}

function ReleaseDetails({ pullRequest }: { pullRequest: ReleasePullRequest }) {
  const details = useMemo(() => parseReleaseBody(pullRequest.body), [pullRequest.body]);
  const visibleCategories = categoryConfig.filter(category => details[category.key].length > 0);

  return (
    <div className="space-y-3 border-t border-zinc-800/80 px-4 py-4">
      <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
        <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-600">Sürüm özeti</div>
        <p className="mt-2 text-[11px] leading-6 text-zinc-300">{pullRequest.summary}</p>
      </div>
      {visibleCategories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-5 text-center text-[10px] leading-5 text-zinc-600">Bu sürüm için açıklama bulunmuyor. Ayrıntıları GitHub bağlantısından inceleyebilirsiniz.</div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {visibleCategories.map(category => {
            const Icon = category.icon;
            return (
              <section key={category.key} className={`rounded-xl border p-4 ${category.className}`}>
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <h4 className="text-[11px] font-semibold text-zinc-100">{category.title}</h4>
                    <p className="mt-0.5 text-[9px] text-zinc-600">{category.description}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {details[category.key].map(item => (
                    <li key={item} className="flex items-start gap-2 text-[10px] leading-5 text-zinc-400">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800/70 pt-3 text-[9px] text-zinc-600">
        <span>PR #{pullRequest.number}</span>
        <span>•</span>
        <span>{pullRequest.author}</span>
        <span>•</span>
        <span>{formatDate(pullRequest.mergedAt || pullRequest.updatedAt)}</span>
        <a href={pullRequest.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
          GitHub PR açıklamasını aç
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

export function ReleaseNotesTree({ compact = false, className = '' }: ReleaseNotesTreeProps) {
  const [data, setData] = useState<ReleaseHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [openMajors, setOpenMajors] = useState<Set<string>>(new Set());
  const [openReleases, setOpenReleases] = useState<Set<number>>(new Set());

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/release-history${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Sürüm geçmişi alınamadı (${response.status}).`);
      const payload = (await response.json()) as ReleaseHistoryResponse;
      setData(payload);
      const first = payload.pullRequests[0];
      if (first) {
        setOpenMajors(new Set([majorOf(first.version)]));
        setOpenReleases(new Set([first.number]));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sürüm geçmişi alınamadı.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('tr-TR');
    return (data?.pullRequests || []).filter(pullRequest => {
      if (statusFilter !== 'all' && pullRequest.status !== statusFilter) return false;
      if (!search) return true;
      return `${pullRequest.version} ${pullRequest.number} ${pullRequest.title} ${pullRequest.summary} ${pullRequest.body}`.toLocaleLowerCase('tr-TR').includes(search);
    });
  }, [data, query, statusFilter]);

  const grouped = useMemo(() => {
    const majors = new Map<string, ReleasePullRequest[]>();
    for (const pullRequest of filtered) {
      const major = majorOf(pullRequest.version);
      majors.set(major, [...(majors.get(major) || []), pullRequest]);
    }
    return [...majors.entries()]
      .sort(([left], [right]) => {
        const leftNumber = Number.parseInt(left, 10);
        const rightNumber = Number.parseInt(right, 10);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return rightNumber - leftNumber;
        return right.localeCompare(left, 'tr-TR');
      })
      .map(([major, releases]) => ({
        major,
        releases: releases.sort((left, right) => {
          const versionOrder = compareVersions(left.version, right.version);
          return versionOrder || right.number - left.number;
        })
      }));
  }, [filtered]);

  const counts = useMemo(
    () => ({
      total: data?.pullRequests.length || 0,
      released: data?.pullRequests.filter(item => item.status === 'released').length || 0,
      inProgress: data?.pullRequests.filter(item => item.status === 'in-progress').length || 0,
      closed: data?.pullRequests.filter(item => item.status === 'closed').length || 0
    }),
    [data]
  );

  const toggleSet = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) =>
    setter(previous => {
      const next = new Set(previous);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  if (loading && !data)
    return (
      <div className={`flex min-h-72 items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-black/20 text-xs text-zinc-500 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Bütün pull requestler okunuyor…
      </div>
    );
  if (error && !data)
    return (
      <div className={`rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-6 text-center ${className}`}>
        <AlertTriangle className="mx-auto h-6 w-6 text-red-300" />
        <div className="mt-3 text-sm font-semibold">Sürüm geçmişi yüklenemedi</div>
        <p className="mt-2 text-xs text-zinc-500">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void load(true)}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Tekrar dene
        </Button>
      </div>
    );

  return (
    <div className={`space-y-4 ${className}`}>
      <section className={`rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/[0.07] ${compact ? 'p-4' : 'p-6'}`}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-medium text-cyan-300">
              <GitPullRequest className="h-4 w-4" />
              Canlı sürüm ağacı
            </div>
            <h2 className={`mt-2 font-semibold tracking-tight ${compact ? 'text-xl' : 'text-3xl'}`}>Coreor Database değişiklik geçmişi</h2>
            <p className="mt-2 max-w-3xl text-[11px] leading-6 text-zinc-400">Her sürüm tek pull request ile ilerler. Bu nedenle sürüm ve PR artık aynı ağaç satırında gösterilir; satırı açtığınızda doğrudan o sürümün tüm ayrıntılarına ulaşırsınız.</p>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-[10px]" disabled={loading} onClick={() => void load(true)}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}GitHub’dan yenile
          </Button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Bütün sürümler', counts.total, 'text-zinc-100'],
            ['Yayınlanan', counts.released, 'text-emerald-300'],
            ['Hazırlanan', counts.inProgress, 'text-cyan-300'],
            ['Kapatılan', counts.closed, 'text-zinc-400']
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-xl border border-zinc-800 bg-black/20 p-3">
              <div className={`text-lg font-semibold ${tone}`}>{value}</div>
              <div className="mt-1 text-[9px] text-zinc-600">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {(data?.warning || data?.source === 'fallback') && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[10px] leading-5 text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>GitHub’a anlık erişilemediği için uygulamayla birlikte gelen yedek sürüm geçmişi gösteriliyor. {data.warning}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-black/20 p-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-600" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Sürüm, PR veya değişiklik ara…" className="h-8 w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-8 pr-3 text-[10px] outline-none focus:border-cyan-500/40" />
        </div>
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
          {(
            [
              ['all', 'Tümü'],
              ['released', 'Yayınlanan'],
              ['in-progress', 'Hazırlanan'],
              ['closed', 'Kapatılan']
            ] as Array<[StatusFilter, string]>
          ).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`rounded-md px-2.5 py-1.5 text-[9px] ${statusFilter === value ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-14 text-center">
          <CircleDot className="mx-auto h-7 w-7 text-zinc-700" />
          <div className="mt-3 text-xs text-zinc-500">Arama veya filtreyle eşleşen sürüm bulunamadı.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(majorGroup => {
            const majorOpen = openMajors.has(majorGroup.major);
            return (
              <section key={majorGroup.major} className="overflow-hidden rounded-2xl border border-zinc-800 bg-black/15">
                <button type="button" onClick={() => toggleSet(setOpenMajors, majorGroup.major)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.025]">
                  {majorOpen ? <ChevronDown className="h-4 w-4 text-cyan-400" /> : <ChevronRight className="h-4 w-4 text-zinc-600" />}
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] font-mono text-xs font-semibold text-cyan-300">{majorGroup.major}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">{majorGroup.major} sürüm ailesi</span>
                    <span className="mt-0.5 block text-[9px] text-zinc-600">{majorGroup.releases.length} sürüm</span>
                  </span>
                </button>

                {majorOpen && (
                  <div className="border-t border-zinc-800 px-3 py-3">
                    {majorGroup.releases.map(pullRequest => {
                      const releaseOpen = openReleases.has(pullRequest.number);
                      const status = statusInfo(pullRequest.status, pullRequest.draft);
                      const StatusIcon = status.icon;
                      return (
                        <article key={pullRequest.number} className="relative ml-3 border-l border-zinc-800 pb-3 pl-5 last:pb-0">
                          <span className="absolute -left-1.5 top-5 h-3 w-3 rounded-full border-2 border-zinc-950 bg-cyan-500" />
                          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/55">
                            <button type="button" onClick={() => toggleSet(setOpenReleases, pullRequest.number)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.025]">
                              {releaseOpen ? <ChevronDown className="mt-0.5 h-4 w-4 text-cyan-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 text-zinc-600" />}
                              <span className="mt-0.5 shrink-0 rounded-lg border border-zinc-800 bg-black/25 px-2.5 py-1 font-mono text-[10px] font-semibold text-zinc-100">v{pullRequest.version}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[9px] font-medium text-zinc-600">PR #{pullRequest.number}</span>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] ${status.className}`}>
                                    <StatusIcon className="h-2.5 w-2.5" />
                                    {status.label}
                                  </span>
                                  {pullRequest.number === data?.pullRequests[0]?.number && <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[8px] text-purple-300">EN YENİ</span>}
                                </div>
                                <h3 className="mt-1.5 text-[11px] font-semibold text-zinc-100">{pullRequest.title}</h3>
                                <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-zinc-600">{pullRequest.summary}</p>
                              </div>
                              <span className="shrink-0 text-[8px] text-zinc-700">{formatDate(pullRequest.mergedAt || pullRequest.updatedAt)}</span>
                            </button>
                            {releaseOpen && <ReleaseDetails pullRequest={pullRequest} />}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-black/20 px-3 py-2 text-[9px] text-zinc-600">
        <GitPullRequest className="h-3.5 w-3.5 text-cyan-400" />
        <span>Kaynak: {data?.repository}</span>
        <span>•</span>
        <span>Son okuma: {data ? formatDate(data.fetchedAt) : '—'}</span>
        <span className="ml-auto">
          Sürüm ve PR tek kayıt olarak gösterilir; yeni PR başlık veya açıklamasında <span className="font-mono text-zinc-400">x.y.z</span> sürümü bulunmalıdır.
        </span>
      </div>
    </div>
  );
}
