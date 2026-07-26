import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  GitPullRequest,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Wrench
} from 'lucide-react';

const sections = [
  {
    kind: 'Eklendi',
    tone: 'emerald',
    items: [
      {
        title: 'Transaction çalışma alanı',
        summary: 'Autocommit, açık transaction uyarısı, commit ve rollback artık ayrı bir çalışma alanında yönetiliyor.',
        details: [
          'Autocommit açıkken sorgular mevcut kısa ömürlü API akışında çalışır.',
          'Autocommit kapatıldığında aynı MySQL bağlantısı üzerinde gerçek transaction oturumu açılır.',
          'Çalıştırılan ve henüz commit edilmemiş statement’lar süre, sonuç ve etkilenen satır bilgileriyle listelenir.',
          'Açık transaction varken sunucu ve veritabanı seçimi kilitlenir.',
          'Pencere açık transaction ile kapatılamaz; kullanıcı commit veya rollback seçmelidir.',
          'On dakika hareketsiz kalan transaction sunucu tarafında otomatik rollback edilir.',
          'Implicit commit oluşturabilecek DDL ve yetki sorguları transaction çalışma alanında engellenir.'
        ]
      },
      {
        title: 'Modal ayarlar merkezi',
        summary: 'Ayarlar artık editörü terk etmeden Notebook ve Kullanıcılar araçları gibi modal olarak açılıyor.',
        details: [
          'Hesap, Sunucular, Görünüm, Erişilebilirlik, Sorgu Editörü, Güvenlik, Gelişmiş ve Yenilikler sekmeleri eklendi.',
          'Sunucu profilleri ayarlardan eklenebilir, düzenlenebilir, test edilebilir, yenilenebilir ve şifreli kasadan silinebilir.',
          'Eski ayar URL’leri editör arka planını açıp doğru modal sekmesini gösterecek uyumluluk katmanına bağlandı.',
          'Veritabanı istemcisiyle ilgisi olmayan faturalama, cihaz, ürün ve bağlı uygulama menüleri ayar navigasyonundan kaldırıldı.'
        ]
      }
    ]
  },
  {
    kind: 'Değişti',
    tone: 'cyan',
    items: [
      {
        title: 'Next.js 16 ve Turbopack altyapısı',
        summary: 'Uygulama Next.js 16.2.11 Active LTS ve React 19.2 tabanına taşındı.',
        details: [
          'Geliştirme ve production build süreçleri varsayılan Turbopack derleyicisini kullanır.',
          'Minimum Node.js sürümü 20.9 olarak tanımlandı.',
          'Kaldırılan next lint komutu yerine doğrudan ESLint CLI kullanılıyor.',
          'ESLint yapılandırması Next.js 16 flat-config yapısına geçirildi.',
          'TypeScript, lint ve production build için tek npm check komutu eklendi.',
          'Lucide React güncellenerek eski icon export uyumsuzlukları temizlendi.'
        ]
      },
      {
        title: 'Yükleme deneyimi',
        summary: 'Editör ve oturum yükleme ekranları tema uyumlu, ortalanmış tek bir 2.0 görünümünde birleştirildi.',
        details: [
          'Eski tam ekran sidebar/table skeleton görünümü kaldırıldı.',
          'AMOLED, aydınlık ve diğer uygulama temalarının CSS değişkenleri kullanılıyor.',
          'Oturum doğrulama, editör ve ayarlar yüklemeleri aynı görsel dilde gösteriliyor.'
        ]
      }
    ]
  },
  {
    kind: 'Düzeltildi',
    tone: 'amber',
    items: [
      {
        title: 'Şema grafiğinde undefined React bileşeni',
        summary: 'DatabaseSchemaGraph açılırken oluşan “Element type is invalid” hatası giderildi.',
        details: [
          'Hata eski lucide-react paketinde bulunmayan Columns3 ikon export’undan kaynaklanıyordu.',
          'Lucide React güncellendi ve şema grafiği ikonları güncel paket sözleşmesine taşındı.',
          'Şema grafiğinin tablo, kolon ve foreign key yükleme akışı korunuyor.'
        ]
      },
      {
        title: 'Çakışan ayarlar route’ları',
        summary: 'Aynı URL’ye çözülen iki farklı advanced, appearance ve accessibility sayfası kaldırıldı.',
        details: [
          'Eski settings/(pages) placeholder route’ları gerçek ayar route’larından ayrıldı.',
          'Next.js “two parallel pages resolve to the same path” build hatası giderildi.',
          'Ayar sayfasında oluşan build overlay artık editörün diğer bölümlerine geçişi engellemiyor.'
        ]
      }
    ]
  },
  {
    kind: 'Güvenlik',
    tone: 'purple',
    items: [
      {
        title: 'Transaction oturum sınırları',
        summary: 'Uzun yaşayan bağlantılar kullanıcı kimliğine bağlandı ve kontrollü süre/sayı sınırları getirildi.',
        details: [
          'Bir kullanıcı aynı anda en fazla dört açık transaction oluşturabilir.',
          'Transaction ID başka bir kullanıcı tarafından kullanılamaz.',
          'Sunucu genelindeki açık transaction sayısı sınırlandırılır.',
          'Süresi dolan bağlantılar commit edilmeden rollback edilir ve kapatılır.',
          'Host, port, özel ağ allowlist, NextAuth ve same-origin kontrolleri transaction API’sinde de korunur.'
        ]
      }
    ]
  }
];

const history = [
  ['1.9.1', '#11', 'Komut paleti, canlı performans paneli ve SQL Notebook'],
  ['1.9.0', '#10', 'Kullanıcı/yetki yönetimi, process merkezi, ER grafiği ve aktarım araçları'],
  ['1.8.0', '#9', 'HeidiSQL benzeri tablo yapı editörü ve ayrıntılı katalog'],
  ['1.7.0', '#8', 'Global context menu, hücre düzenleme ve çoklu SQL sekmeleri'],
  ['1.5.0', '#6', 'Sunucu tarafı pagination, filtreleme, sıralama ve gerçek SQL günlüğü'],
  ['1.0.0', '#1', 'AES-256-GCM şifreli tarayıcı kasası ve çoklu sunucu profilleri']
];

const toneClasses: Record<string, string> = {
  emerald: 'border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-300',
  cyan: 'border-cyan-500/25 bg-cyan-500/[0.05] text-cyan-300',
  amber: 'border-amber-500/25 bg-amber-500/[0.05] text-amber-300',
  purple: 'border-purple-500/25 bg-purple-500/[0.05] text-purple-300'
};

export default function WhatsNewPage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-background text-foreground">
      <div className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-4">
          <Link href="/editor" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <Sparkles className="h-4 w-4 text-cyan-400" />
          <div className="text-xs font-semibold">Coreor Database sürüm notları</div>
          <span className="ml-auto rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 font-mono text-[9px] text-cyan-300">v2.0.0</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <section className="overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/12 via-background to-purple-500/10">
          <div className="p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2 text-[10px]"><span className="rounded-full bg-emerald-500/12 px-2 py-1 text-emerald-300">MAJOR RELEASE</span><span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-muted-foreground"><GitPullRequest className="h-3 w-3" />release/2.0</span><span className="text-muted-foreground">26 Temmuz 2026</span></div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">Coreor Database 2.0</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Bu sürüm yalnızca yeni özellik eklemiyor; uygulamanın Next.js altyapısını, ayar mimarisini ve veritabanı transaction modelini yeniden düzenliyor. Aşağıdaki notlar kullanıcıya görünen değişiklikleri ve operasyonel etkilerini ayrı ayrı açıklar.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-background/50 p-4"><PackageCheck className="h-5 w-5 text-cyan-400" /><div className="mt-3 text-xs font-semibold">Platform yenilemesi</div><div className="mt-1 text-[10px] leading-5 text-muted-foreground">Next.js 16, React 19 ve Turbopack.</div></div><div className="rounded-xl border bg-background/50 p-4"><ShieldCheck className="h-5 w-5 text-emerald-400" /><div className="mt-3 text-xs font-semibold">Kontrollü transaction</div><div className="mt-1 text-[10px] leading-5 text-muted-foreground">Açık bağlantı, commit, rollback ve timeout koruması.</div></div><div className="rounded-xl border bg-background/50 p-4"><Wrench className="h-5 w-5 text-amber-400" /><div className="mt-3 text-xs font-semibold">Kritik düzeltmeler</div><div className="mt-1 text-[10px] leading-5 text-muted-foreground">Şema ikonu ve çakışan ayar route’ları.</div></div></div>
          </div>
        </section>

        {sections.map(section => (
          <section key={section.kind} className="rounded-2xl border bg-card/40 p-4 md:p-5">
            <div className="mb-4 flex items-center gap-3"><span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${toneClasses[section.tone]}`}>{section.kind}</span><div className="h-px flex-1 bg-border" /></div>
            <div className="space-y-3">{section.items.map(item => <details key={item.title} open className="group rounded-xl border bg-background/45"><summary className="cursor-pointer list-none p-4"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" /><div className="min-w-0"><h2 className="text-sm font-semibold">{item.title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.summary}</p></div><span className="ml-auto text-xs text-muted-foreground transition group-open:rotate-180">⌄</span></div></summary><div className="border-t px-4 py-3"><div className="mb-2 font-mono text-[9px] text-muted-foreground">## Ayrıntılar</div><ul className="grid gap-2 lg:grid-cols-2">{item.details.map(detail => <li key={detail} className="flex items-start gap-2 rounded-lg border bg-card/45 p-3 text-[11px] leading-5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{detail}</li>)}</ul></div></details>)}</div>
          </section>
        ))}

        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
          <h2 className="text-sm font-semibold text-amber-200">2.0 geçiş notları</h2>
          <ul className="mt-3 space-y-2 text-[11px] leading-5 text-amber-100/75"><li>• Node.js 20.9 veya üzeri gerekir.</li><li>• Bağımlılık kilidi Next.js 16 ve React 19 sürümlerine göre yeniden oluşturulmalıdır.</li><li>• Production ortamında açık transaction oturumları stateful Node.js instance’ında tutulur; scale-out dağıtımda sticky session veya ortak transaction servisi gerekir.</li><li>• Transaction çalışma alanı DDL çalıştırmaz; tablo yapısı değişiklikleri Yapı editöründen yapılmaya devam eder.</li><li>• Özel ağdaki MySQL sunucuları için DATABASE_ALLOWED_HOSTS ve DATABASE_ALLOWED_PORTS allowlist ayarları korunmalıdır.</li></ul>
        </section>

        <section className="rounded-2xl border bg-card/40 p-5"><div className="mb-4"><h2 className="text-sm font-semibold">Önceki kilometre taşları</h2><p className="mt-1 text-[10px] text-muted-foreground">2.0’a temel oluşturan önemli sürümler.</p></div><div className="grid gap-2 md:grid-cols-2">{history.map(([version, pr, description]) => <div key={version} className="flex items-center gap-3 rounded-xl border bg-background/45 p-3"><span className="rounded-lg bg-muted px-2 py-1 font-mono text-[10px]">v{version}</span><div className="min-w-0 flex-1 text-[10px] leading-4 text-muted-foreground">{description}</div><span className="font-mono text-[9px] text-cyan-400">{pr}</span></div>)}</div></section>
      </div>
    </main>
  );
}
