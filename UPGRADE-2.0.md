# Coreor Database 2.0 geçiş rehberi

Coreor Database 2.0; Next.js 16, React 19, Turbopack, modal ayarlar mimarisi ve stateful transaction çalışma alanına geçer.

## 1. Runtime

Önerilen geliştirme ve production runtime:

```bash
nvm install
nvm use
node --version
```

`.nvmrc` Node.js `22.20.0` kullanır. Uygulamanın teknik alt sınırı Node.js `20.9.0` olarak tanımlanmıştır.

## 2. Bağımlılıkları temiz kur

Next.js ve React major sürümleri değiştiği için eski `node_modules` dizinini kullanmayın:

```bash
rm -rf node_modules .next
npm install
```

Windows PowerShell:

```powershell
Remove-Item node_modules,.next -Recurse -Force -ErrorAction SilentlyContinue
npm install
```

`npm install` sonrasında güncellenen `package-lock.json` dosyasını commit edin. Lockfile güncellenmeden `npm ci` kullanılmamalıdır.

## 3. Doğrulama

```bash
npm run typecheck
npm run lint
npm run build
```

Tek komut:

```bash
npm run check
```

Next.js 16 ile `next lint` kaldırılmıştır. Lint işlemi doğrudan ESLint CLI üzerinden çalışır.

## 4. Turbopack

Next.js 16'da Turbopack hem geliştirme hem production build için varsayılandır:

```bash
npm run dev
npm run build
```

Webpack'e dönmek için yalnızca geçici teşhis sırasında resmi `--webpack` bayrağı kullanılmalıdır. 2.0'ın normal çalışma yolu Turbopack'tir.

## 5. Ortam değişkenleri

Mevcut kimlik doğrulama ve veritabanı güvenlik değişkenleri korunur:

```env
GITHUB_ID=...
GITHUB_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

DATABASE_ALLOWED_HOSTS=192.168.50.25,db.internal.example.com
DATABASE_ALLOWED_PORTS=3306,3307
DATABASE_QUERY_TIMEOUT_MS=30000
DATABASE_MAX_RESULT_ROWS=5000
DATABASE_API_MAX_BODY_BYTES=12000000
```

`NEXTAUTH_SECRET` sabit kalmalıdır. Değişirse mevcut NextAuth oturum çerezleri çözülemez ve kullanıcı yeniden giriş yapmak zorunda kalır.

## 6. Transaction çalışma alanı

Transaction oturumları normal sorgu API'sinden farklı olarak aynı MySQL bağlantısını açık tutar.

- Oturumlar NextAuth kullanıcı kimliğine bağlıdır.
- Bir kullanıcı en fazla dört açık transaction oluşturabilir.
- Sunucu genelinde en fazla 100 açık transaction tutulur.
- On dakika hareketsizlikte otomatik rollback yapılır.
- Modal açık transaction ile doğrudan kapatılamaz.
- DDL ve implicit commit oluşturabilecek yönetim sorguları transaction alanında engellenir.

### Dağıtım modeli

Tek Node.js instance veya sticky-session kullanan self-hosted dağıtımlarda doğrudan çalışır.

Birden fazla bağımsız instance kullanan serverless/scale-out dağıtımlarda transaction bağlantısı yalnızca oturumu açan instance belleğinde bulunur. Bu modelde aşağıdaki seçeneklerden biri gerekir:

1. Sticky session ile aynı kullanıcıyı aynı instance'a yönlendirmek.
2. Transaction işlemlerini ayrı stateful bir veritabanı gateway servisine taşımak.
3. Transaction özelliğini yalnızca tek instance çalışan yönetim panelinde etkinleştirmek.

## 7. Ayarlar route değişiklikleri

Ayarlar artık ayrı tam ekran sayfalar yerine editör üzerinde modal olarak açılır.

Eski URL'ler uyumluluk amacıyla korunur:

- `/editor/settings`
- `/editor/settings/servers`
- `/editor/settings/appearance`
- `/editor/settings/accessibility`
- `/editor/settings/query`
- `/editor/settings/security`
- `/editor/settings/advanced`
- `/editor/settings/whats-new`

Bu route'lar editörü render eder ve ilgili modal sekmesini otomatik açar.

Eski `settings/(pages)` placeholder route grubu kaldırılmıştır. Bu klasörün geri getirilmesi aynı URL'ye çözülen paralel page hatalarına yol açar.

## 8. Smoke test listesi

- GitHub ile giriş ve oturum yenileme
- Şifreli kasadan sunucu listesinin açılması
- Ayarlar modalından sunucu ekleme/düzenleme/silme
- Şema grafiğinin açılması
- Foreign key çizgilerinin ve kolon ikonlarının render edilmesi
- Autocommit açık sorgu
- Autocommit kapalı INSERT/UPDATE/DELETE
- Commit sonrası verinin kalıcı olması
- Rollback sonrası verinin geri alınması
- Açık transaction ile modal kapatma koruması
- Transaction timeout sonrası otomatik rollback
- `npm run check`
