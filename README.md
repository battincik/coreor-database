# Coreor Web Database

Tarayıcı üzerinden birden fazla MySQL sunucusunu yönetmek için geliştirilen, HeidiSQL çalışma mantığını modern bir web arayüzüne taşıyan Next.js uygulaması.

## Güncel mimari

- Kullanıcı oturumu NextAuth ve GitHub sağlayıcısı ile yönetilir.
- MySQL sunucu profilleri aktif kullanıcı hesabına göre ayrılır.
- Host, kullanıcı adı ve parola tarayıcı IndexedDB içinde AES-256-GCM ile şifrelenir.
- Merkezi `api.coreor.net` sunucu kayıt servisi kullanılmaz.
- Tarayıcının raw MySQL TCP bağlantısı açamaması nedeniyle sorgular her MySQL ağına yakın çalışan stateless HTTPS connector üzerinden iletilir.
- Connector sunucu profillerini veya parolaları kalıcı olarak saklamaz.

Ayrıntılı güvenlik modeli ve connector endpoint sözleşmesi için [`docs/browser-vault-and-connector.md`](docs/browser-vault-and-connector.md) dosyasına bakın.

## Gereksinimler

- Node.js 22+
- Next.js 15
- GitHub OAuth uygulaması
- MySQL ağına erişebilen Coreor uyumlu HTTPS connector

## Ortam değişkenleri

```env
GITHUB_ID=
GITHUB_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3302

# Opsiyonel. Her sunucu profilinde farklı connector URL girilebilir.
NEXT_PUBLIC_DATABASE_CONNECTOR_URL=
```

## Geliştirme

```bash
npm install
npm run dev
```

Uygulama varsayılan Next.js geliştirme portunda açılır. Üretim başlangıç komutu `3302` portunu kullanır:

```bash
npm run build
npm run start
```

## Güvenlik notları

- MySQL `root` kullanıcısını tarayıcı istemcisine tanımlamayın.
- Ayrı, en az yetkili bir MySQL hesabı oluşturun.
- MySQL TLS ve connector HTTPS bağlantısını zorunlu tutun.
- Connector CORS politikasını yalnızca uygulamanın origin'i ile sınırlandırın.
- Connector request body ve parolalarını loglamayın.
- IndexedDB aynı cihaz/tarayıcı profiline özeldir; cihazlar arası senkronizasyon sağlamaz.
- XSS riskine karşı CSP, Trusted Types, bağımlılık denetimi ve sıkı connector ağ erişimi uygulanmalıdır.

## Yol haritası

- Stateless MySQL connector referans paketi
- Sunucu düzenleme, silme ve bağlantı testi
- SQL editörünün `/v1/query` endpoint'ine bağlanması
- Transaction yönetimi ve sorgu iptali
- Şifreli vault export/import
- Zero-knowledge cihazlar arası senkronizasyon
- MariaDB ve PostgreSQL connector adaptörleri
