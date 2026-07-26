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
  source: 'github' | 'fallback';
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
  12: '2.0.0'
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
  12: 'Next.js 16, modal ayarlar ve transaction çalışma alanı'
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
  12: 'Uygulama Next.js 16 ve Turbopack’e taşındı; ayarlar modal hâle getirildi ve gerçek commit/rollback destekli transaction alanı eklendi.'
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
    number: 12,
    version: '2.0.0',
    title: RELEASE_TITLE_OVERRIDES[12],
    summary: RELEASE_SUMMARY_OVERRIDES[12],
    body: `## Gelenler\n- Autocommit, açık transaction uyarısı, statement listesi, commit ve rollback içeren transaction çalışma alanı eklendi.\n- Hesap, sunucular, görünüm, erişilebilirlik, sorgu, güvenlik, gelişmiş ve yenilikler sekmelerine sahip modal ayarlar merkezi eklendi.\n- Ayarlardan sunucu ekleme, düzenleme, test etme, katalog yenileme ve silme işlemleri kullanılabilir hâle geldi.\n\n## Değişenler\n- Next.js 16.2.11, React 19.2 ve Turbopack tabanına geçildi.\n- Yükleme ekranları ortalanmış ve tema uyumlu tek tasarımda birleştirildi.\n\n## Düzeltilenler\n- Şema grafiğini açarken oluşan geçersiz React bileşeni hatası giderildi.\n- Aynı adrese çözülen ayar sayfalarının derlemeyi durdurması engellendi.\n\n## Güvenlik\n- Transaction oturumları kullanıcıya bağlandı, süre ve sayı sınırları eklendi.\n- Hareketsiz transaction bağlantıları otomatik rollback ile kapatılır.`,
  },
  {
    number: 11,
    version: '1.9.1',
    title: RELEASE_TITLE_OVERRIDES[11],
    summary: RELEASE_SUMMARY_OVERRIDES[11],
    body: `## Gelenler\n- Ctrl veya Cmd + K ile açılan global komut paleti eklendi.\n- QPS, bağlantılar, buffer pool, replikasyon ve depolama görünümünü bir araya getiren performans paneli eklendi.\n- SQL, Markdown, sonuç tablosu ve grafik hücrelerini aynı belgede birleştiren SQL Notebook eklendi.\n\n## Düzeltilenler\n- Ayarlar ekranındaki desteklenmeyen ikon nedeniyle oluşan açılış hatası giderildi.\n- Gelecekte eksik ikon olsa bile ayar sayfasının tamamen çökmesini önleyen güvenli ikon yedeği eklendi.`,
  },
  {
    number: 10,
    version: '1.9.0',
    title: RELEASE_TITLE_OVERRIDES[10],
    summary: RELEASE_SUMMARY_OVERRIDES[10],
    body: `## Gelenler\n- MySQL ve MariaDB kullanıcıları, roller, yetkiler ve GRANT/REVOKE işlemleri için yönetim ekranı eklendi.\n- Çalışan sorgular, kilitler ve deadlock bilgileri için process merkezi eklendi.\n- Tabloları sürükleyerek düzenleyebilen ve kolonlardan foreign key oluşturabilen şema grafiği eklendi.\n- CSV, JSON ve SQL içe-dışa aktarma araçları eklendi.\n- Tema, yazı, yoğunluk, sorgu davranışı ve erişilebilirlik ayarları eklendi.\n\n## Değişenler\n- Sidebar genişliği sürüklenebilir ve kalıcı hâle getirildi.\n- Boyut değerleri B, KB, MB, GB ve TB arasında otomatik gösterilmeye başladı.`,
  },
  {
    number: 9,
    version: '1.8.0',
    title: RELEASE_TITLE_OVERRIDES[9],
    summary: RELEASE_SUMMARY_OVERRIDES[9],
    body: `## Gelenler\n- Veritabanı ve tablolar için boyut, satır, motor, charset, collation, indeks ve foreign key ayrıntıları eklendi.\n- Hücre düzenleme, satır silme, satır çoğaltma, dosyayı TEXT/BLOB alanına yazma ve dışa aktarma araçları genişletildi.\n- Kolon, indeks, foreign key, motor, row format, yorum ve auto increment yönetebilen şema editörü eklendi.\n- Veri ve yapı görünümü seçimi tablo değiştirildiğinde korunmaya başladı.\n\n## Düzeltilenler\n- Sorgu sekmesi kapatılırken başka bileşenin state değerini render sırasında değiştiren React hatası giderildi.`,
  },
  {
    number: 8,
    version: '1.7.0',
    title: RELEASE_TITLE_OVERRIDES[8],
    summary: RELEASE_SUMMARY_OVERRIDES[8],
    body: `## Gelenler\n- Uygulama geneli, sunucu, veritabanı, tablo, kolon ve hücre için bağlama duyarlı sağ tık menüleri eklendi.\n- Primary key kullanan güvenli inline hücre düzenleme eklendi.\n- Sunucu veya veritabanı kapsamı seçilebilen çoklu SQL sorgu sekmeleri eklendi.\n- Bottom bar bağlantı, katalog, grid ve sorgu metrikleriyle genişletildi.\n\n## Güvenlik\n- Tehlikeli sorgular doğrudan çalıştırılmak yerine kullanıcıya düzenleyebileceği taslak olarak açılır.\n- Hücre güncellemeleri primary key ve tek satır sınırıyla çalışır.`,
  },
  {
    number: 7,
    version: '1.6.0',
    title: RELEASE_TITLE_OVERRIDES[7],
    summary: RELEASE_SUMMARY_OVERRIDES[7],
    body: `## Düzeltilenler\n- Aktif olmayan sekmelerin tablo veri görünümünün üstünde bıraktığı büyük boşluk kaldırıldı.\n- SQL günlüğündeki satırlar daha kompakt hâle getirildi.\n- Sunucu ve hedef bilgileri tek satırda gösterilmeye başladı.\n- Alt konsolun açık yüksekliği azaltıldı.`,
  },
  {
    number: 6,
    version: '1.5.0',
    title: RELEASE_TITLE_OVERRIDES[6],
    summary: RELEASE_SUMMARY_OVERRIDES[6],
    body: `## Gelenler\n- Tablo satırları sunucudan sayfa sayfa alınmaya başladı.\n- Sunucu tarafı filtreleme, tekli ve çoklu sıralama eklendi.\n- Tablo listesine arama, sıralama ve sayfalama eklendi.\n- SQL günlüğüne başarı, uyarı, hata, süre, satır sayısı ve işlem ayrıntısı eklendi.\n\n## Değişenler\n- Kasa ve navigasyon olayları SQL günlüğünden çıkarıldı; yalnızca gerçekten çalıştırılan sorgular gösterilir.\n\n## Güvenlik\n- Filtre değerleri güvenli parametreler olarak gönderilir ve sorgu sınırları sunucuda uygulanır.`,
  },
  {
    number: 5,
    version: '1.4.0',
    title: RELEASE_TITLE_OVERRIDES[5],
    summary: RELEASE_SUMMARY_OVERRIDES[5],
    body: `## Düzeltilenler\n- Bazı MySQL ve MariaDB sürümlerinde veritabanı ve tablo listesini tamamen boş bırakan katalog sorgusu düzeltildi.\n- Hiç tablosu olmayan veritabanlarının listede kalması sağlandı.\n- Aynı tablonun yanlışlıkla iki kez eklenmesine karşı tekrar kontrolü eklendi.\n\n## Uyumluluk\n- Katalog okuma MySQL 5.7, 8.x, 9.x ve desteklenen MariaDB sürümlerinde ortak alanları kullanır.`,
  },
  {
    number: 4,
    version: '1.3.0',
    title: RELEASE_TITLE_OVERRIDES[4],
    summary: RELEASE_SUMMARY_OVERRIDES[4],
    body: `## Düzeltilenler\n- Kullanıcı giriş yapmış görünse bile veritabanı API’sinin 401 döndürmesine neden olan oturum çözme problemi giderildi.\n- Okunamayan veya eski oturum çerezleri temizlenerek yeniden giriş açıklaması gösterilmeye başladı.\n- Login ekranına süresi dolmuş veya geçersiz oturum uyarıları eklendi.\n\n## Güvenlik\n- NextAuth oturum anahtarı kararlı hâle getirildi ve üretimde sabit bir gizli anahtar kullanımı belgelendi.`,
  },
  {
    number: 3,
    version: '1.2.0',
    title: RELEASE_TITLE_OVERRIDES[3],
    summary: RELEASE_SUMMARY_OVERRIDES[3],
    body: `## Gelenler\n- Kasa, katalog, tablo yapısı ve tablo verisi için ayrı yükleme, boş ve hata ekranları eklendi.\n- SQL, katalog ve veri işlemlerini zaman, süre ve sonuçlarıyla gösteren gerçek işlem konsolu eklendi.\n- GitHub hesap adı, e-posta ve avatar bilgileri hesap ayarlarına bağlandı.\n\n## Kaldırılanlar\n- Sahte uptime, sahte bağlantı sayısı, rastgele sorgu sayacı ve sabit kullanıcı bilgileri kaldırıldı.\n\n## Güvenlik\n- Parola ve kullanıcı adı konsola yazılmaz; dışa aktarımda host bilgisi gizlenir.`,
  },
  {
    number: 2,
    version: '1.1.0',
    title: RELEASE_TITLE_OVERRIDES[2],
    summary: RELEASE_SUMMARY_OVERRIDES[2],
    body: `## Değişenler\n- MySQL ve MariaDB bağlantıları aynı origin üzerindeki oturum korumalı Next.js API’sine taşındı.\n- Harici connector URL alanı ve bağlantı çağrıları kaldırıldı.\n- Sunucu bağlantıları işlem anında açılıp işlem tamamlandığında kapatılmaya başladı.\n\n## Güvenlik\n- Oturum, same-origin, istek boyutu, hız sınırı, sorgu zaman aşımı ve host/port izin listesi kontrolleri eklendi.\n- Bağlantı parolaları uygulama sunucusunda kalıcı olarak tutulmaz.`,
  },
  {
    number: 1,
    version: '1.0.0',
    title: RELEASE_TITLE_OVERRIDES[1],
    summary: RELEASE_SUMMARY_OVERRIDES[1],
    body: `## Gelenler\n- MySQL sunucu profilleri kullanıcı hesabına bağlı şifreli tarayıcı kasasına taşındı.\n- Çoklu sunucu profili, TLS modu ve hesap bazlı aktif sunucu seçimi eklendi.\n- Veritabanı ve tablo kataloğunun şifreli kasada önbelleğe alınması eklendi.\n\n## Kaldırılanlar\n- Merkezi sunucu kayıt ve okuma bağımlılığı kaldırıldı.\n- Host, kullanıcı adı ve parolanın localStorage içinde tutulması sona erdi.\n\n## Bilmeniz gerekenler\n- Şifreli kasa aynı cihaz ve tarayıcı profiline özeldir; profiller başka cihaza otomatik taşınmaz.`,
  }
];

export const FALLBACK_RELEASE_HISTORY: ReleasePullRequest[] = fallbackData.map(item => ({
  ...item,
  status: 'released',
  draft: false,
  author: 'battincik',
  url: `https://github.com/battincik/web.database.coreor.net/pull/${item.number}`,
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  mergedAt: '2026-07-26T00:00:00.000Z'
}));
