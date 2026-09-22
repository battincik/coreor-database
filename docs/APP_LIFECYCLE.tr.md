# Hata raporlama ve uygulama içi güncelleme

## Davranış

- Üretim derlemesinde uygulama hatası gönderimi varsayılan açık; Ayarlar → Gelişmiş → Güncellemeler ve hata raporlama bölümünden kapatılır.
- Tercih native config dizinindeki `diagnostics.json` içinde tutulur. Bozuk tercih dosyası uzaktan gönderimi kapatır.
- `error.log` Tauri `app_log_dir` altında JSON Lines olarak yazılır; gerçek yol ayarlarda gösterilir. 5 MiB sınırında `error.log.1` dosyasına döndürülür. Yerel kayıt gönderimden bağımsızdır.
- JS global hataları, yakalanmamış promise hataları, React sınırları, `console.error` ile kaydedilen Error nesneleri, native IPC uygulama hataları ve Rust panic hook kapsanır. Yakalanıp tamamen yutulan hatalar için `reportAppError` çağrısı gerekir. İşletim sistemi tarafından zorla sonlandırılma gibi olaylarda kayıt garantisi yoktur.
- SQL/sunucu/bağlantı hataları `DatabaseClientError` olarak operasyonel hata kabul edilir; hata raporlama servisine gönderilmez. Bunların mevcut SQL etkinlik günlüğü ayrı çalışır.
- Hassas bilgi taşıyabileceği için ham hata mesajı, tam stack, SQL, sorgu sonucu, bağlantı bilgisi, dosya yolu ve kullanıcı kimliği rapora alınmaz. Hata türü ve paketlenmiş JS dosyası/satır/sütun bilgisi gönderilir. Native kayıtlarda kaynak ve hata türü bulunur; ham panic mesajı yoktur.
- Dakikada en fazla 60 olay kaydedilir. Gönderim kuyruğu bellekte en fazla 100 olaydır; 15 saniyede bir gönderilir. Ağ/5xx/429 için en fazla 3 deneme, 8 saniye timeout, yönlendirme takibi yoktur. Kuyruk uygulama kapanınca kaybolur; yerel log kalır. Uzaktan gönderim kapatıldığında en fazla devam eden 8 saniyelik istek beklenir ve kuyruk temizlenir. Daha önce gönderilmiş kayıt geri alınamaz.

## Hata API sözleşmesi

`POST https://api.coreor.net/app/database/error-report`

```json
{
  "schemaVersion": 1,
  "eventId": "UUID",
  "timestamp": "2026-09-22T00:00:00Z",
  "appVersion": "3.1.0",
  "os": "windows",
  "arch": "x86_64",
  "source": "react",
  "kind": "ReferenceError",
  "frames": [{ "file": "abc123.js", "line": 21, "column": 4 }]
}
```

Başarı: herhangi bir 2xx. Yanıt gövdesi kullanılmaz. Sunucu `eventId` ile tekrarları ayıklamalı, şema/boyut doğrulaması ve rate limit uygulamalıdır. İstemciye kalıcı servis sırrı gömülmez. Bu depo API sunucusunu içermez; endpoint'in bu sözleşmeyi kabul ettiği ayrıca doğrulanmalıdır. Test sırasında canlı endpoint'e sahte hata gönderilmemiştir.

## Güncelleme

Kaynak: `https://github.com/battincik/web.database.coreor.net/releases/latest/download/latest.json`.

Depo şu anda private; public olunca yayınlanmış stable release ve dosyaları tokensız erişilebilir olmalı. Kaynak deposunun görünürlüğü bu değişiklikte değiştirilmez. Taslak release güncelleme kaynağına görünmez. Private depo/404/offline kontrol hatası açılışı engellemez; başlangıç ekranı en fazla 12 saniye görünür. Native metadata kontrolü 10 saniyede timeout olur.

Başlangıçta otomatik kontrol yapılır. Sonrasında varsayılan 60 dakika; 15/30/60/120/240 dakika seçenekleri vardır. Yeni sürümde topbar'da yeşil indirme simgesi çıkar. Kullanıcı simgeden veya ayarlardan kurmayı başlatır. Açılış kontrolü kendiliğinden kurulum başlatmaz.

İstemci imzalı paketi indirir, doğrular ve mevcut kurulum üzerine uygular. Windows'ta Tauri NSIS updater `passive` mod kullanır; kullanıcı ayrı EXE seçmez, kaldırıp yeniden kurmaz. Sistem izinlerine göre UAC/kurulum ilerleme penceresi görülebilir. Bu bir delta patch sistemi değildir: yeni uygulama paketi indirilir. Başarılı kurulumdan sonra yeni sürüm açılır. Kimlik `net.coreor.database` ve veri dizinleri korunmalıdır.

Güvenlik: UI'da aktif IPC, çok adımlı import/export/bakım işleri, bekleyen kalıcı yazmalar, kayıt bekleyen SQL sekmeleri ve düzenlenmekte olan tablo/şema verisi engeldir. Sekme hatırlama kapalıyken dolu SQL sekmeleri güncellemeyi engeller. Native tarafta tüm veritabanı/config/workspace komutları paylaşımlı kilit alır; kurulum özel kilit alır ve açık transaction varsa reddedilir. Kilit indirme/kurulum boyunca tutulur, bu sırada yeni işler ve pencere kapatma engellenir. Kontrolden sonra yeni sorgu başlama yarışı native tarafta kapanır. İş bitince kurulum otomatik tetiklenmez; kullanıcı tekrar tıklar.

## Geliştirme bypass

`npm run dev` / `npm run tauri:dev`: Rust `debug_assertions` nedeniyle güncelleme kontrolleri ve kurulum native tarafta kapalıdır; uzaktan hata gönderimi de kapalıdır. `error.log` çalışır. `.env`, uygulama içi geliştirici araçları anahtarı veya elle değiştirilen localStorage bu güvenliği açamaz.

İmza public key'i olmadan normal release derlemesi de updater'ı devre dışı gösterir. Güncellemeyi gerçekten test etmek için ayrı test makinesinde iki **release** derlemesi, test imza anahtarı ve kontrol edilen bir test feed'i kullanılmalı; üretim anahtarları dev için kullanılmamalıdır. İmzayı atlama yolu yoktur.

## İmzalı yayın hazırlığı

1. Kalıcı updater private key `D:\\Secure\\Coreor\\coreor-updater.key`, public key ise `D:\\Secure\\Coreor\\coreor-updater.key.pub` konumunda tutulur. Private key yedeklenir ve depoya eklenmez.
2. GitHub Actions variable: `COREOR_UPDATER_PUBLIC_KEY` (public key dosyasının içeriği).
3. GitHub Actions secrets: `TAURI_SIGNING_PRIVATE_KEY`, gerekiyorsa `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Sürüm `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` ve lockfile'larda eşit tutulur. İlk desktop release hedefi `26.9.1`'dir ve `YY.M.RELEASE` politikası kullanılır.
5. `Signed release candidate` workflow'u elle çalıştırılır. Kontroller başarısızsa yayın durur. NSIS / AppImage / macOS arm64 ve x64 imzalı paketleri ile `latest.json` taslak release'e eklenir. Platformlar manifest yazma yarışını önlemek için sırayla çalışır.
6. `FIRST_RELEASE_CHECKLIST.tr.md` tamamlandıktan sonra taslak elle yayımlanır. Bu değişiklik herhangi bir release yayımlamaz veya üretim signing key üretmez.

Tauri update imzası Windows Authenticode/macOS Developer ID imzasından farklıdır. OS imzalama/notarization ayrıca ilk sürüm kontrol listesindedir.

Resmî kaynaklar: https://v2.tauri.app/plugin/updater/ ve https://github.com/tauri-apps/tauri-action.
