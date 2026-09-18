export type ReleasePullRequestStatus = 'released' | 'in-progress' | 'closed';

export interface ReleasePullRequest {
  number: number;
  version: string;
  title: string;
  summary: string;
  body: string;
  url: string;
  author: string;
  status: ReleasePullRequestStatus;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
}

export interface ReleaseHistoryResponse {
  repository: string;
  fetchedAt: string;
  source: 'github' | 'fallback' | 'local';
  warning?: string;
  pullRequests: ReleasePullRequest[];
}

export const RELEASE_VERSION_OVERRIDES: Record<number, string> = {
  1: '1.0.0',
  2: '1.1.0',
  3: '1.2.0',
  4: '1.3.0',
  5: '1.4.0',
  6: '1.5.0',
  7: '1.6.0',
  8: '1.7.0',
  9: '1.8.0',
  10: '1.9.0',
  11: '1.9.1',
  12: '2.0.0',
  13: '2.0.1'
};

export const RELEASE_TITLE_OVERRIDES: Record<number, string> = {
  1: 'Şifreli tarayıcı kasası ve çoklu sunucu profilleri',
  2: 'MySQL bağlantılarının Next.js API’ye taşınması',
  3: 'Editör durumları, hesap ayarları ve gerçek SQL günlüğü',
  4: 'GitHub oturumlarının kararlı hâle getirilmesi',
  5: 'MySQL ve MariaDB katalog uyumluluğu',
  6: 'Sunucu tarafı tablo grid’i ve SQL konsolu',
  7: 'Tablo boşlukları ve daha kompakt SQL kayıtları',
  8: 'Bağlama duyarlı menüler, hücre düzenleme ve sorgu sekmeleri',
  9: 'HeidiSQL tarzı şema editörü ve ayrıntılı katalog',
  10: 'Gelişmiş yönetim, yetki, process ve aktarım araçları',
  11: 'Komut paleti, performans paneli ve SQL Notebook',
  12: 'Next.js 16, modal ayarlar ve transaction çalışma alanı',
  13: 'Zengin BottomBar, sade profil alanı ve canlı PR sürüm ağacı'
};

export const RELEASE_SUMMARY_OVERRIDES: Record<number, string> = {
  1: 'Sunucu bilgileri merkezi bir servisten çıkarıldı ve kullanıcı hesabına bağlı, tarayıcıda şifrelenen güvenli kasaya taşındı.',
  2: 'MySQL ve MariaDB işlemleri harici bağlantı servisinden çıkarılarak oturum korumalı Next.js sunucu API’sine taşındı.',
  3: 'Yükleme ve boş ekranlar düzeltildi, gerçek GitHub hesabı bağlandı ve alt konsol gerçek işlem geçmişini göstermeye başladı.',
  4: 'Oturum anahtarı ve bozuk çerez sorunları giderilerek API isteklerinin beklenmedik şekilde giriş ekranına düşmesi önlendi.',
  5: 'Farklı MySQL ve MariaDB sürümlerinde veritabanı ile tablo listesinin boş kalmasına neden olan katalog sorgusu düzeltildi.',
  6: 'Büyük tablolar için sunucu tarafı sayfalama, filtreleme ve sıralama eklendi; alt konsol gerçek SQL günlüğüne dönüştürüldü.',
  7: 'Aktif olmayan sekmelerin oluşturduğu büyük boşluk kaldırıldı ve SQL günlüğü daha sıkı bir görünüme getirildi.',
  8: 'Sunucu, veritabanı, tablo ve hücrelere özel sağ tık menüleri; güvenli hücre düzenleme ve çoklu sorgu sekmeleri eklendi.',
  9: 'Veritabanı kataloğu ayrıntılandırıldı, tablo verisi çalışma alanı genişletildi ve arayüzden yönetilebilen kapsamlı şema editörü eklendi.',
  10: 'Kullanıcı ve yetki yönetimi, process merkezi, şema grafiği, içe-dışa aktarma ve kapsamlı uygulama ayarları eklendi.',
  11: 'Global komut paleti, canlı performans görünümü ve SQL ile Markdown hücrelerini birleştiren Notebook çalışma alanı eklendi.',
  12: 'Uygulama Next.js 16 ve Turbopack’e taşındı; ayarlar modal hâle getirildi ve gerçek commit/rollback destekli transaction alanı eklendi.',
  13: 'BottomBar gerçek sunucu uptime ve performans bilgileriyle zenginleştirildi, sidebar profil alanı sadeleştirildi ve bütün PR’ları otomatik gösteren sürüm ağacı eklendi.'
};

export function extractReleaseVersion(number: number, title: string, body: string) {
  const overridden = RELEASE_VERSION_OVERRIDES[number];
  if (overridden) return overridden;
  const match = `${title}\n${body.slice(0, 2500)}`.match(/\b(?:v(?:ersion)?\s*)?(\d+\.\d+\.\d+)\b/i);
  return match?.[1] || `PR-${number}`;
}

export function cleanReleaseTitle(number: number, title: string) {
  return RELEASE_TITLE_OVERRIDES[number] || title
    .replace(/^(feat|fix|chore|refactor|docs|perf|build)(\([^)]*\))?:\s*/i, '')
    .replace(/\bcoreor database\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractReleaseSummary(number: number, body: string, title: string) {
  if (RELEASE_SUMMARY_OVERRIDES[number]) return RELEASE_SUMMARY_OVERRIDES[number];
  const withoutCode = body.replace(/```[\s\S]*?```/g, ' ');
  const paragraph = withoutCode
    .split(/\n\s*\n/)
    .map(value => value.replace(/^#+\s*/gm, '').replace(/^[-*]\s+/gm, '').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim())
    .find(value => value.length >= 40 && !/^(özet|değişiklikler|doğrulama)$/i.test(value));
  return paragraph?.slice(0, 420) || cleanReleaseTitle(number, title);
}

const fallbackData: Array<Omit<ReleasePullRequest, 'status' | 'draft' | 'createdAt' | 'updatedAt' | 'mergedAt' | 'author' | 'url'>> = [
  {
    number: 13,
    version: '2.0.1',
    title: RELEASE_TITLE_OVERRIDES[13],
    summary: RELEASE_SUMMARY_OVERRIDES[13],
    body: `## Gelenler
- BottomBar gerçek MySQL veya MariaDB uptime değerini göstermeye başladı.
- Coreor içinde aktif sunucu profilinin ne kadar süredir seçili olduğu ayrı bir sayaç olarak eklendi.
- Bağlantı sağlığı, thread sayıları, buffer pool, depolama, trafik, katalog, grid ve SQL başarı metrikleri alt çubuğa eklendi.
- Bütün açık, birleşmiş ve kapatılmış pull requestleri sürüm sürüm gösteren canlı Yenilikler ağacı eklendi.
- Sürüm ağacına arama, durum filtresi, GitHub’dan yenileme ve özgün PR bağlantıları eklendi.

## Değişenler
- Sidebar altındaki küçük profil alanı büyük avatar, kullanıcı adı, e-posta ve oturum durumu gösterecek şekilde yenilendi.
- Hesap menüsündeki Ayarları aç seçeneği mevcut modal ayarlar merkezini açacak şekilde değiştirildi.
- Statik yenilik kartları kullanıcı odaklı PR açıklamalarını çözümleyen ağaç görünümüne dönüştürüldü.

## Kaldırılanlar
- Sidebar’daki ayrı ayarlar ikonu kaldırıldı.
- Sidebar’daki karanlık ve aydınlık tema ikonu kaldırıldı.
- Next.js 15 ve React 18 bilgileri taşıyan geçersiz eski package-lock dosyası kaldırıldı.

## Güvenlik ve koruma
- Sürüm geçmişi API’si yalnızca giriş yapmış kullanıcılara açıldı.
- Private repository token’ı yalnızca sunucuda kullanılır ve sürüm cevapları ortak proxy cache’ine yazılmaz.
- Arka plan performans kontrolleri SQL günlüğünü doldurmaz.

## Bilmeniz gerekenler
- Sunucu uptime gerçek veritabanı sunucusundan gelir.
- Coreor süresi yalnızca aktif profil seçili kalma süresidir; normal SQL bağlantıları işlem sonunda kapanmaya devam eder.
- Yeni PR’lar başlık veya açıklamadaki sürüm numarasına göre otomatik yerleştirilir; sürüm numarası yoksa yine Sürümlendirilmemiş dalında görünür.`
  },
  {
    number: 12,
    version: '2.0.0',
    title: RELEASE_TITLE_OVERRIDES[12],
    summary: RELEASE_SUMMARY_OVERRIDES[12],
    body: `## Gelenler
- Autocommit, açık transaction uyarısı, statement listesi, commit ve rollback içeren transaction çalışma alanı eklendi.
- Hesap, sunucular, görünüm, erişilebilirlik, sorgu, güvenlik, gelişmiş ve yenilikler sekmelerine sahip modal ayarlar merkezi eklendi.
- Ayarlardan sunucu ekleme, düzenleme, test etme, katalog yenileme ve silme işlemleri kullanılabilir hâle geldi.

## Değişenler
- Next.js 16.2.11, React 19.2 ve Turbopack tabanına geçildi.
- Yükleme ekranları ortalanmış ve tema uyumlu tek tasarımda birleştirildi.

## Düzeltilenler
- Şema grafiğini açarken oluşan geçersiz React bileşeni hatası giderildi.
- Aynı adrese çözülen ayar sayfalarının derlemeyi durdurması engellendi.

## Güvenlik
- Transaction oturumları kullanıcıya bağlandı, süre ve sayı sınırları eklendi.
- Hareketsiz transaction bağlantıları otomatik rollback ile kapatılır.`
  },
  {
    number: 11,
    version: '1.9.1',
    title: RELEASE_TITLE_OVERRIDES[11],
    summary: RELEASE_SUMMARY_OVERRIDES[11],
    body: `## Gelenler
- Ctrl veya Cmd + K ile açılan global komut paleti eklendi.
- QPS, bağlantılar, buffer pool, replikasyon ve depolama görünümünü bir araya getiren performans paneli eklendi.
- SQL, Markdown, sonuç tablosu ve grafik hücrelerini aynı belgede birleştiren SQL Notebook eklendi.

## Düzeltilenler
- Ayarlar ekranındaki desteklenmeyen ikon nedeniyle oluşan açılış hatası giderildi.
- Gelecekte eksik ikon olsa bile ayar sayfasının tamamen çökmesini önleyen güvenli ikon yedeği eklendi.`
  },
  {
    number: 10,
    version: '1.9.0',
    title: RELEASE_TITLE_OVERRIDES[10],
    summary: RELEASE_SUMMARY_OVERRIDES[10],
    body: `## Gelenler
- MySQL ve MariaDB kullanıcıları, roller, yetkiler ve GRANT/REVOKE işlemleri için yönetim ekranı eklendi.
- Çalışan sorgular, kilitler ve deadlock bilgileri için process merkezi eklendi.
- Tabloları sürükleyerek düzenleyebilen ve kolonlardan foreign key oluşturabilen şema grafiği eklendi.
- CSV, JSON ve SQL içe-dışa aktarma araçları eklendi.
- Tema, yazı, yoğunluk, sorgu davranışı ve erişilebilirlik ayarları eklendi.

## Değişenler
- Sidebar genişliği sürüklenebilir ve kalıcı hâle getirildi.
- Boyut değerleri B, KB, MB, GB ve TB arasında otomatik gösterilmeye başladı.`
  },
  {
    number: 9,
    version: '1.8.0',
    title: RELEASE_TITLE_OVERRIDES[9],
    summary: RELEASE_SUMMARY_OVERRIDES[9],
    body: `## Gelenler
- Veritabanı ve tablolar için boyut, satır, motor, charset, collation, indeks ve foreign key ayrıntıları eklendi.
- Hücre düzenleme, satır silme, satır çoğaltma, dosyayı TEXT/BLOB alanına yazma ve dışa aktarma araçları genişletildi.
- Kolon, indeks, foreign key, motor, row format, yorum ve auto increment yönetebilen şema editörü eklendi.
- Veri ve yapı görünümü seçimi tablo değiştirildiğinde korunmaya başladı.

## Düzeltilenler
- Sorgu sekmesi kapatılırken başka bileşenin state değerini render sırasında değiştiren React hatası giderildi.`
  },
  {
    number: 8,
    version: '1.7.0',
    title: RELEASE_TITLE_OVERRIDES[8],
    summary: RELEASE_SUMMARY_OVERRIDES[8],
    body: `## Gelenler
- Uygulama geneli, sunucu, veritabanı, tablo, kolon ve hücre için bağlama duyarlı sağ tık menüleri eklendi.
- Primary key kullanan güvenli inline hücre düzenleme eklendi.
- Sunucu veya veritabanı kapsamı seçilebilen çoklu SQL sorgu sekmeleri eklendi.
- Bottom bar bağlantı, katalog, grid ve sorgu metrikleriyle genişletildi.

## Güvenlik
- Tehlikeli sorgular doğrudan çalıştırılmak yerine kullanıcıya düzenleyebileceği taslak olarak açılır.
- Hücre güncellemeleri primary key ve tek satır sınırıyla çalışır.`
  },
  {
    number: 7,
    version: '1.6.0',
    title: RELEASE_TITLE_OVERRIDES[7],
    summary: RELEASE_SUMMARY_OVERRIDES[7],
    body: `## Düzeltilenler
- Aktif olmayan sekmelerin tablo veri görünümünün üstünde bıraktığı büyük boşluk kaldırıldı.
- SQL günlüğündeki satırlar daha kompakt hâle getirildi.
- Sunucu ve hedef bilgileri tek satırda gösterilmeye başladı.
- Alt konsolun açık yüksekliği azaltıldı.`
  },
  {
    number: 6,
    version: '1.5.0',
    title: RELEASE_TITLE_OVERRIDES[6],
    summary: RELEASE_SUMMARY_OVERRIDES[6],
    body: `## Gelenler
- Tablo satırları sunucudan sayfa sayfa alınmaya başladı.
- Sunucu tarafı filtreleme, tekli ve çoklu sıralama eklendi.
- Tablo listesine arama, sıralama ve sayfalama eklendi.
- SQL günlüğüne başarı, uyarı, hata, süre, satır sayısı ve işlem ayrıntısı eklendi.

## Değişenler
- Kasa ve navigasyon olayları SQL günlüğünden çıkarıldı; yalnızca gerçekten çalıştırılan sorgular gösterilir.

## Güvenlik
- Filtre değerleri güvenli parametreler olarak gönderilir ve sorgu sınırları sunucuda uygulanır.`
  },
  {
    number: 5,
    version: '1.4.0',
    title: RELEASE_TITLE_OVERRIDES[5],
    summary: RELEASE_SUMMARY_OVERRIDES[5],
    body: `## Düzeltilenler
- Bazı MySQL ve MariaDB sürümlerinde veritabanı ve tablo listesini tamamen boş bırakan katalog sorgusu düzeltildi.
- Hiç tablosu olmayan veritabanlarının listede kalması sağlandı.
- Aynı tablonun yanlışlıkla iki kez eklenmesine karşı tekrar kontrolü eklendi.

## Uyumluluk
- Katalog okuma MySQL 5.7, 8.x, 9.x ve desteklenen MariaDB sürümlerinde ortak alanları kullanır.`
  },
  {
    number: 4,
    version: '1.3.0',
    title: RELEASE_TITLE_OVERRIDES[4],
    summary: RELEASE_SUMMARY_OVERRIDES[4],
    body: `## Düzeltilenler
- Kullanıcı giriş yapmış görünse bile veritabanı API’sinin 401 döndürmesine neden olan oturum çözme problemi giderildi.
- Okunamayan veya eski oturum çerezleri temizlenerek yeniden giriş açıklaması gösterilmeye başladı.
- Login ekranına süresi dolmuş veya geçersiz oturum uyarıları eklendi.

## Güvenlik
- NextAuth oturum anahtarı kararlı hâle getirildi ve üretimde sabit bir gizli anahtar kullanımı belgelendi.`
  },
  {
    number: 3,
    version: '1.2.0',
    title: RELEASE_TITLE_OVERRIDES[3],
    summary: RELEASE_SUMMARY_OVERRIDES[3],
    body: `## Gelenler
- Kasa, katalog, tablo yapısı ve tablo verisi için ayrı yükleme, boş ve hata ekranları eklendi.
- SQL, katalog ve veri işlemlerini zaman, süre ve sonuçlarıyla gösteren gerçek işlem konsolu eklendi.
- GitHub hesap adı, e-posta ve avatar bilgileri hesap ayarlarına bağlandı.

## Kaldırılanlar
- Sahte uptime, sahte bağlantı sayısı, rastgele sorgu sayacı ve sabit kullanıcı bilgileri kaldırıldı.

## Güvenlik
- Parola ve kullanıcı adı konsola yazılmaz; dışa aktarımda host bilgisi gizlenir.`
  },
  {
    number: 2,
    version: '1.1.0',
    title: RELEASE_TITLE_OVERRIDES[2],
    summary: RELEASE_SUMMARY_OVERRIDES[2],
    body: `## Değişenler
- MySQL ve MariaDB bağlantıları aynı origin üzerindeki oturum korumalı Next.js API’sine taşındı.
- Harici connector URL alanı ve bağlantı çağrıları kaldırıldı.
- Sunucu bağlantıları işlem anında açılıp işlem tamamlandığında kapatılmaya başladı.

## Güvenlik
- Oturum, same-origin, istek boyutu, hız sınırı, sorgu zaman aşımı ve host/port izin listesi kontrolleri eklendi.
- Bağlantı parolaları uygulama sunucusunda kalıcı olarak tutulmaz.`
  },
  {
    number: 1,
    version: '1.0.0',
    title: RELEASE_TITLE_OVERRIDES[1],
    summary: RELEASE_SUMMARY_OVERRIDES[1],
    body: `## Gelenler
- MySQL sunucu profilleri kullanıcı hesabına bağlı şifreli tarayıcı kasasına taşındı.
- Çoklu sunucu profili, TLS modu ve hesap bazlı aktif sunucu seçimi eklendi.
- Veritabanı ve tablo kataloğunun şifreli kasada önbelleğe alınması eklendi.

## Kaldırılanlar
- Merkezi sunucu kayıt ve okuma bağımlılığı kaldırıldı.
- Host, kullanıcı adı ve parolanın localStorage içinde tutulması sona erdi.

## Bilmeniz gerekenler
- Şifreli kasa aynı cihaz ve tarayıcı profiline özeldir; profiller başka cihaza otomatik taşınmaz.`
  }
];

export const FALLBACK_RELEASE_HISTORY: ReleasePullRequest[] = fallbackData.map(item => ({
  ...item,
  status: item.number === 13 ? 'in-progress' : 'released',
  draft: item.number === 13,
  author: 'battincik',
  url: `https://github.com/battincik/web.database.coreor.net/pull/${item.number}`,
  createdAt: item.number === 13 ? '2026-07-26T11:45:04.000Z' : '2026-07-25T00:00:00.000Z',
  updatedAt: item.number === 13 ? '2026-07-26T11:45:04.000Z' : '2026-07-26T00:00:00.000Z',
  mergedAt: item.number === 13 ? null : '2026-07-26T00:00:00.000Z'
}));
