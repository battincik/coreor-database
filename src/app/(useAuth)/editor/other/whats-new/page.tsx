'use client';

import React from 'react';
import { GitPullRequest, Sparkles, Tag } from 'lucide-react';
import { SettingsPageShell } from '../../settings/components/settings-page-shell';

const releases = [
  { version: '1.9.1', pr: '#11', date: '26 Temmuz 2026', title: 'Komut, Performans ve SQL Notebook Yaması', tone: 'from-purple-500/20 to-cyan-500/10', items: ['Ctrl/Cmd + K komut paleti; komut, veritabanı ve tablo araması', 'Paletten tablo açma, yeni sorgu oluşturma ve yazılan SQL’i doğrudan çalıştırma', 'QPS, aktif bağlantı, InnoDB buffer pool ve slow query performans kartları', 'MySQL/MariaDB replication lag ve thread durumu', 'Şema bazlı mantıksal veri, indeks ve boş alan kullanımı', 'SQL ve Markdown hücreleri, sonuç tabloları, bar/çizgi/pasta grafikleri içeren kalıcı SQL Notebook', 'Kurulu Lucide sürümünde bulunmayan Cable ikonunun neden olduğu ayarlar çökmesinin düzeltilmesi', 'Ayarlar sidebar’ına gelecekteki eksik ikonlar için güvenli fallback eklenmesi'] },
  { version: '1.9.0', pr: '#10', date: '26 Temmuz 2026', title: 'Advanced Database Workbench', tone: 'from-cyan-500/20 to-purple-500/10', items: ['MySQL kullanıcı, rol ve GRANT/REVOKE yönetimi', 'Process listesi, metadata lock ve deadlock merkezi', 'Sürüklenebilir ER/flow şeması ve kolondan foreign key oluşturma', 'CSV, JSON ve SQL içe aktarma; CSV, JSON ve INSERT SQL dışa aktarma', 'SQL autocomplete, formatter, snippet, geçmiş ve favoriler', '7 uygulama teması, 6 syntax teması, erişilebilirlik ve gelişmiş ayarlar', 'Kalıcı ve sürüklenebilir sidebar genişliği'] },
  { version: '1.8.0', pr: '#9', date: '26 Temmuz 2026', title: 'HeidiSQL Şema Editörü', tone: 'from-emerald-500/20 to-cyan-500/10', items: ['Ayrıntılı veritabanı ve tablo kataloğu', 'Kolon, indeks, foreign key ve tablo seçeneği düzenleme', 'Bire bir SHOW CREATE TABLE çıktısı', 'Gelişmiş hücre context menüsü ve TEXT/BLOB işlemleri', 'Veri/Yapı görünümünün tablo geçişlerinde korunması', 'Kompakt 10 satırlık SQL günlüğü'] },
  { version: '1.7.0', pr: '#8', date: '25 Temmuz 2026', title: 'Context Menu ve Çoklu SQL Çalışma Alanı', tone: 'from-blue-500/20 to-cyan-500/10', items: ['Uygulama geneli portal tabanlı context menu', 'Sunucu, veritabanı, tablo, kolon ve hücre menüleri', 'Primary key tabanlı güvenli inline hücre düzenleme', 'Sunucu/veritabanı kapsamlı çoklu SQL sekmeleri', 'Ayrıntılı alt durum tooltipleri'] },
  { version: '1.6.0', pr: '#7', date: '25 Temmuz 2026', title: 'Kompakt Grid ve SQL Günlüğü', tone: 'from-zinc-500/20 to-blue-500/10', items: ['Aktif olmayan tab panellerinin yer kaplaması düzeltildi', 'Tablo verisi üzerindeki büyük boşluk kaldırıldı', 'SQL günlüğü satırları ve açık yüksekliği sıkıştırıldı'] },
  { version: '1.5.0', pr: '#6', date: '25 Temmuz 2026', title: 'Sunucu Tarafı Grid ve Gerçek SQL Konsolu', tone: 'from-purple-500/20 to-blue-500/10', items: ['LIMIT/OFFSET pagination ve COUNT önbelleği', 'Sunucu tarafı filtreleme ve çoklu sıralama', 'AbortController ile eski istekleri iptal etme', 'Yalnızca gerçekten çalıştırılan SQL ifadelerini gösteren günlük', 'Sorgu ayrıntı modalı ve JSON log export'] },
  { version: '1.4.0', pr: '#5', date: '25 Temmuz 2026', title: 'Katalog Uyumluluğu', tone: 'from-amber-500/20 to-orange-500/10', items: ['MySQL/MariaDB information_schema alias parse hatası düzeltildi', 'Tablosu olmayan veritabanları katalogda korundu', 'Sürüm uyumlu katalog sorgusu oluşturuldu'] },
  { version: '1.3.0', pr: '#4', date: '25 Temmuz 2026', title: 'Kararlı NextAuth Oturumları', tone: 'from-red-500/20 to-amber-500/10', items: ['NEXTAUTH_SECRET ve AUTH_SECRET öncelik sırası', 'JWEDecryptionFailed oturum kurtarma akışı', 'Geçersiz session cookie temizleme', 'Açıklayıcı SESSION_INVALID hata durumu'] },
  { version: '1.2.0', pr: '#3', date: '25 Temmuz 2026', title: 'Gerçek Durumlar ve Hesap Ayarları', tone: 'from-green-500/20 to-emerald-500/10', items: ['Loading, empty ve error durumları ayrıştırıldı', 'Gerçek GitHub/NextAuth hesap ekranı', 'HeidiSQL benzeri gerçek işlem günlüğü', 'Sunucu, katalog ve sorgu aktivitelerinin merkezi kaydı'] },
  { version: '1.1.0', pr: '#2', date: '25 Temmuz 2026', title: 'Next.js MySQL API', tone: 'from-sky-500/20 to-indigo-500/10', items: ['Harici connector mimarisi kaldırıldı', 'Same-origin oturum doğrulamalı /api/database eklendi', 'mysql2 ile kısa ömürlü sunucu bağlantıları', 'Host/port allowlist, SSRF koruması ve sorgu limitleri'] },
  { version: '1.0.0', pr: '#1', date: '25 Temmuz 2026', title: 'Şifreli Tarayıcı Kasası', tone: 'from-fuchsia-500/20 to-purple-500/10', items: ['Sunucu profilleri IndexedDB içinde AES-256-GCM ile şifrelendi', 'Parolalar localStorage kullanımından çıkarıldı', 'Hesap bazlı kasa namespace ve çoklu sunucu profilleri', 'İlk güvenli bağlantı mimarisi ve dokümantasyon'] }
];

export default function WhatsNewPage() {
  return (
    <SettingsPageShell activeTab="whatsNew" icon={Sparkles} eyebrow="Ürün günlüğü" title="Yenilikler" description="Coreor Database'in ilk şifreli kasa sürümünden gelişmiş veritabanı çalışma alanına kadar bütün önemli değişiklikler.">
      <div className="rounded-xl border bg-card/60 p-4 text-xs text-muted-foreground"><strong className="text-foreground">Sürümleme:</strong> Büyük çalışma alanı özellikleri minor, geriye uyumlu özellik ve düzeltme paketleri patch sürümü olarak yayınlanır.</div>
      <div className="relative space-y-5 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-border">
        {releases.map((release, index) => (
          <article key={release.version} className="relative pl-12">
            <div className={`absolute left-0 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border bg-gradient-to-br ${release.tone} shadow-lg`}><Tag className="h-4 w-4" /></div>
            <div className={`overflow-hidden rounded-2xl border bg-gradient-to-br ${release.tone}`}>
              <div className="border-b bg-background/55 px-5 py-4 backdrop-blur">
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border bg-background/70 px-2 py-1 font-mono text-[11px] font-semibold">v{release.version}</span><span className="inline-flex items-center gap-1 rounded-full border bg-background/50 px-2 py-1 text-[10px] text-muted-foreground"><GitPullRequest className="h-3 w-3" />{release.pr}</span>{index === 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-medium text-emerald-300">Güncel geliştirme</span>}<span className="ml-auto text-[10px] text-muted-foreground">{release.date}</span></div>
                <h2 className="mt-3 text-lg font-semibold">{release.title}</h2>
              </div>
              <div className="bg-background/35 p-5"><div className="mb-3 font-mono text-[10px] text-muted-foreground">## Öne çıkanlar</div><ul className="grid gap-2 md:grid-cols-2">{release.items.map(item => <li key={item} className="flex items-start gap-2 rounded-lg border bg-background/45 p-3 text-xs leading-5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{item}</li>)}</ul></div>
            </div>
          </article>
        ))}
      </div>
    </SettingsPageShell>
  );
}
