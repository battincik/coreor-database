# Coreor Database – kalıcı uygulama içi güncelleme altyapısı

## Akış

1. Güncelleme rotası uygulama kimliğiyle ayrılır: Coreor Database için `/v1/coreor-database/desktop-updates/...`; gelecekte diğer uygulamalar kendi adları ve feed'leriyle aynı API'yi kullanabilir.
2. İstemci, başlangıçta `GET https://api.coreor.net/v1/coreor-database/desktop-updates/stable/{target}/{arch}/{currentVersion}` çağırır.
3. API uygun sürüm yoksa `204`, yeni sürüm varsa Tauri'nin `version`, `url`, `signature` alanlarını içeren `200` JSON döndürür.
4. API erişilemezse Tauri, GitHub Releases `latest.json` yedeğine geçer. (API'nin `204` yanıtı güncelleme olmadığı anlamına gelir; bu durumda yedek kullanılmaz.)
5. Açılışta otomatik güncelleme ayarı açıksa ve aktif çalışma yoksa uygulama kendi updater penceresine geçer.
6. Tauri güncelleme paketini indirir, gömülü public key ile minisign imzasını doğrular ve işletim sisteminin desteklediği yöntemle yükler.
7. Windows'ta NSIS yükleyici uygulamayı yeniden açar. macOS/Linux'ta Tauri kurulumdan sonra yeniden başlatılır.

Uygulama açıkken saatlik kontroller sadece **yeni sürümü bildirir**; açık bir SQL işlemine, kaydedilmemiş editör verisine veya transaction'a müdahale etmez.

## Windows ve ilk kurulum

İlk çalıştırma için bir kez uygulama kurulumu gerekebilir. Bundan sonraki güncellemelerde kullanıcı kurulum EXE'si seçmez. NSIS `passive` ilerleme arayüzü gösterebilir ve sistem tarafından yönetici izni istenebilir. Tam görünmez `quiet` kurulum yalnızca kullanıcı yazma iznine sahip kurulumlarda güvenilirdir. Sistem korumalı dizinlere sessizçe dosya yazmaya çalışılmamalıdır.

Bu tasarım **delta/patch** güncellemesi değildir; her yeni sürümde imzalı platform paketi indirilir. Desteklenen Windows/macOS/Linux paketleri Tauri'nin standart updater biçimleridir. Kendi EXE üzerine dosya kopyalayan ayrı bir servis kullanılmaz.

## Release hazırlığı

- Sürüm numarasını `npm run version:prepare YY.M.RELEASE` ile eşitle.
- Mevcut Tauri güncelleme imzalama anahtarını **değiştirme**. Private key'i yalnızca CI secret olarak tut. İstemci public key ile her paketin imzasını doğrular.
- `Signed release candidate` workflow'unda `updaterJsonPreferNsis: true` kullanılır; Windows istemcileri MSI yerine NSIS güncelleme paketini alır.
- Önce N → N+1 testini Windows/macOS/Linux'ta test makinesinde yap. Açık transaction, kesilen internet, geçersiz imza, 204 ve 503 senaryolarını ayrıca dene.
- API tarafının dökümantasyonu: `api.coreor.net/docs/coreor-database-updates.md`.
- API kaynak URL'si değişse bile istemci tekrar derlenmez; API sürüm feed'i yeniden yönlendirir.
- Güncelleme paketleri HTTPS üzerinden dağıtılmalıdır. Sunucu imzasına değil **Tauri paket imzasına** güvenilir.

## Paketlerin dağıtımı

Mevcut durumda API Coreor Database'in GitHub Releases üzerinden yayınlanan `latest.json` manifestini okur. `url` alanı da GitHub Releases'teki imzalı platform paketine işaret eder; uygulama paketi **API üzerinden proxy edilmez**, doğrudan indirme adresinden çekilir. Manifest ve paketler yayınlanmış, istemcinin erişebildiği HTTPS kaynaklarda olmalıdır. Beta/diğer ürünler kendi manifestini kullanır; sunucu tarafındaki `COREOR_DESKTOP_UPDATER_APPS_JSON` kayıtları uygulamaları birbirinden ayırır. İleride yalnızca API manifest kaynaklarını ve manifestteki paket URL'lerini değiştirerek CDN'e geçilebilir. Masaüstü istemci, API başarısız olursa şimdilik GitHub'daki kendi ürününün `latest.json` adresini yedek olarak kullanır.
