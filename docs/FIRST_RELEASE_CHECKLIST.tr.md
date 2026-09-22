# İlk masaüstü sürümü kontrol listesi

Bu liste ilk dağıtılacak masaüstü sürümü içindir. Kaynak kodda mevcut sürüm 3.1.0'dır; 1.0.0'a düşürülmez. İşaretlenmeyen maddeler tamamlanmış sayılmaz.

## 1. Kod ve build kapıları

- [x] TypeScript kontrolü (`npm run typecheck`).
- [x] Üretim UI derlemesi (`npm run ui:build`).
- [x] TR/EN dil anahtarları ve placeholder kontrolü (`npm run i18n:check`).
- [x] Native istemci mimari kontrolü (`npm run architecture:check`).
- [x] Aktif iş / kirli editör kilidi, hata raporu alanları, tekrar ayıklama, kurulum hatası sonrası kilit ve dev bypass testleri (`npm run test:lifecycle`, 5 test).
- [ ] Proje genelinde lint temizliği. Bu çalışma sırasında değişiklik öncesi ve sonrası aynı 61 lint hatası bulundu; yayın kapısı atlanmamalı.
- [ ] Windows, macOS ve Linux `cargo check --locked` ve native testlerinin CI'da geçmesi. Yerel Linux ortamında pkg-config/GTK eksik olduğu için doğrulanamadı. GitHub Actions denemesi de hiçbir job başlamadan startup_failure verdi; neden araç yanıtında belirtilmedi.
- [ ] Rust 1.88 toolchain uyumu ve kilit dosyaları.
- [ ] Temiz cihazlarda NSIS, macOS app/dmg ve Linux AppImage açılışı.

## 2. Hata raporlama

- [ ] API'nin `APP_LIFECYCLE.tr.md` şemasını kabul ettiği staging üzerinde doğrulansın; 2xx, 400, 429, 500 ve timeout senaryoları.
- [ ] Varsayılan açık tercih; kapatma, yeniden başlatma, tekrar açma ve bozuk ayar dosyası testleri.
- [ ] Kapatınca kuyruk temizleniyor, kapalı dönemdeki olaylar sonradan gönderilmiyor.
- [ ] JS/React hatası ve Rust panic yerel error.log'a yazılıyor; dev ortamında hiç remote istek yok.
- [ ] Üretim native çökme senaryolarında rapor sınırlamaları incelensin; panic sonrası bellek kuyruğundaki kayıtların gönderimi garanti değildir.
- [ ] SQL söz dizimi, yetki ve bağlantı hataları uygulama raporuna düşmüyor.
- [ ] İstek gövdesi ve error.log içinde SQL/parola/sonuç/kullanıcı dosya yolu yok.
- [ ] 5 MiB rotasyon, disk dolu/izin yok ve hata fırtınası senaryoları UI'ı kilitlemiyor.

## 3. Güncelleme

- [ ] Public repo ve yayımlanmış stable GitHub Release tokensız erişilebilir.
- [ ] Kalıcı updater signing key bakımcı tarafından oluşturuldu, güvenli yedeklendi; public variable/private secrets ayarlandı.
- [ ] İmzalı N → N+1 güncellemesi gerçek kurulu uygulamada denendi; veriler, profiller, ayarlar ve sekmeler korundu.
- [ ] Kontrol açılışta ve seçilen aralıkta çalışıyor; tek seferde tek kontrol yapılıyor.
- [ ] Private/404/offline/timeout açılışı engellemiyor; yeni sürüm yoksa icon çıkmıyor.
- [ ] Yeni sürümde topbar simgesi, indirilen yüzde, kurulum ve yeniden açılma görüldü.
- [ ] Bozuk imza/eksik asset/yanlış mimari/eski sürüm kurulmuyor.
- [ ] Dev/debug derlemesi güncelleme indirmiyor ve kurmuyor.
- [ ] Aktif sorgu, çok adımlı import/export, bakım işi, bekleyen workspace yazması, düzenlenen hücre/şema ve açık transaction varken güncelleme başlayamıyor.
- [ ] Kontrol-kurulum aralığında yeni sorgu başlatma yarışı, çift tıklama ve Alt+F4 senaryoları.
- [ ] Kaydedilmemiş SQL için sekme hatırlama açık/kapalı testleri; başarısız kaydetme halinde güncelleme engeli.
- [ ] İndirme kesilince tekrar denenebiliyor; kurulum hatası ve restart başarısızlığı gerçek Windows cihazında test edildi.
- [ ] Windows per-user/per-machine, UAC; macOS Intel/Apple Silicon; AppImage yazma yetkileri.
- [ ] Windows Authenticode / macOS imzalama-notarization dağıtım kararı ve SmartScreen/Gatekeeper testi.

## 4. Veritabanı regresyonu

- [ ] Desteklenen her motorda bağlantı test/kaydet/düzenle/sil; TLS modları.
- [ ] Sorgu, iptal/zaman aşımı, sıralama/filtreleme ve 100–5000 satır görünümü.
- [ ] Hücre/satır ekle-güncelle-sil, şema değişiklikleri ve salt okunur koruma.
- [ ] Transaction commit/rollback, import/export ve bakım işlemleri.
- [ ] Kasa/işletim sistemi anahtarı ve eski çalışma alanı göçü; profil ve sekme geri yükleme.
- [ ] TR/EN, AMOLED/açık tema, klavye/fokus ve farklı DPI/ekran boyutları.

## 5. Yayın kararı

- [ ] `docs/PUBLIC_RELEASE_CHECKLIST.md` tamamlandı (public depo içerik incelemesi dahil).
- [ ] `npm run check` tamamen başarılı; bilinen engelleyici hata kalmadı.
- [ ] Sürüm/lockfile/release notları tutarlı, bütün platform paketleri aynı commit'ten.
- [ ] Taslak release içindeki latest.json her platformun URL ve imzasıyla doğrulandı.
- [ ] Kullanıcı kabulü tamamlandı; bakımcı taslağı yayımladı.
