# Tarayıcı kasası ve MySQL connector mimarisi

## Neden doğrudan MySQL bağlantısı yok?

Standart web tarayıcıları MySQL'in `3306/TCP` protokolüne raw socket açamaz. Tarayıcı tarafında `mysql2`, `mysql`, PDO veya benzeri sürücüler çalıştırılamaz. Bu nedenle uygulama merkezi bir Coreor API'si kullanmak yerine her veritabanı ağına yakın konumlandırılan, stateless çalışan küçük bir HTTPS connector ile konuşur.

Connector'ın görevi yalnızca HTTPS isteğini MySQL protokolüne çevirmektir. Sunucu profillerini, kullanıcı hesaplarını veya parolaları kalıcı olarak saklamamalıdır.

## Şifreli profil kasası

Sunucu profilleri tarayıcıdaki IndexedDB içinde tutulur.

- Her NextAuth/GitHub hesabı için `session.user.id` tabanlı ayrı bir kasa namespace'i oluşturulur.
- Her hesap için tarayıcıda non-extractable AES-256-GCM anahtarı üretilir.
- Sunucu listesi tek bir doğrulanmış şifreli payload olarak saklanır.
- AES-GCM additional authenticated data alanı hesap kimliğini ve kasa sürümünü içerir.
- Aktif sunucu ID'si dışında host, kullanıcı adı ve parola `localStorage` içine yazılmaz.
- Parola yalnızca connector isteği hazırlanırken uygulama belleğinde çözülür.

### Sınırlar

Bu yapı **aynı tarayıcı profili ve cihazda** kalıcıdır. IndexedDB senkronizasyon servisi değildir. Kullanıcı başka bir bilgisayarda aynı GitHub hesabıyla giriş yaptığında sunucu profilleri otomatik gelmez.

Cihazlar arası senkronizasyon istenirse ileride yalnızca AES-GCM ile şifrelenmiş vault blob'u saklayan kör bir sync servisi eklenmelidir. Sunucu tarafı anahtarı veya açık bağlantı bilgilerini görmemelidir.

Tarayıcı şifrelemesi XSS'e karşı tek başına yeterli değildir. Uygulama çalışırken aynı origin'de kod çalıştırabilen bir saldırgan, uygulamanın kullandığı CryptoKey ile şifre çözme işlemi başlatabilir. Bu nedenle CSP, bağımlılık güvenliği ve connector erişim kontrolleri zorunludur.

## Connector ayarları

Sunucu ekleme ekranındaki `Connector URL` her profil için ayrı tanımlanabilir. Opsiyonel varsayılan değer:

```env
NEXT_PUBLIC_DATABASE_CONNECTOR_URL=https://mysql-connector.example.com
```

Üretimde:

- HTTPS ve geçerli sertifika kullanılmalı.
- CORS yalnızca web uygulamasının origin'ine izin vermeli.
- Connector internetten herkese açık olmamalı; VPN, private network, mTLS, access proxy veya IP allowlist tercih edilmeli.
- Request body ve bağlantı parolaları loglanmamalı.
- Connector tarafında connection pool kısa ömürlü ve limitli olmalı.
- MySQL `root` hesabı kullanılmamalı.
- Kullanıcıya yalnızca gereken şema ve SQL yetkileri verilmelidir.
- MySQL TLS mümkünse `required` olmalıdır.

## Connector HTTP sözleşmesi

Tüm endpoint'ler `POST`, `Content-Type: application/json` ve JSON yanıt kullanır.

Her isteğin ortak bağlantı alanı:

```json
{
  "connection": {
    "engine": "mysql",
    "host": "10.0.0.15",
    "port": 3306,
    "username": "coreor_client",
    "password": "secret",
    "database": "app_database",
    "sslMode": "required"
  }
}
```

Connector bu alanı request süresi dışında saklamamalıdır.

### `POST /v1/catalog`

Yanıt:

```json
{
  "databases": [
    {
      "name": "app_database",
      "tables": ["users", "orders"]
    }
  ]
}
```

### `POST /v1/table-info`

İstek bağlantı alanına ek olarak:

```json
{
  "database": "app_database",
  "table": "users"
}
```

Yanıt mevcut `TableInfo` tipini döndürür: `columns`, `indexes`, `foreignKeys` ve `createSQL`.

### `POST /v1/table-data`

İstek:

```json
{
  "database": "app_database",
  "table": "users",
  "limit": 512,
  "sort": "-created_at"
}
```

Yanıt:

```json
{
  "data": [],
  "total": 0
}
```

Connector tablo/veritabanı isimlerini SQL string'ine doğrudan eklemeden önce whitelist doğrulaması yapmalıdır. `limit` sunucu tarafında da sınırlandırılmalıdır.

### `POST /v1/query`

İstek:

```json
{
  "database": "app_database",
  "sql": "SELECT * FROM users LIMIT 50"
}
```

Yanıt:

```json
{
  "rows": [],
  "affectedRows": 0,
  "fields": []
}
```

İleri aşamada connector query timeout, maksimum sonuç boyutu, read-only mod, transaction kontrolü ve audit event üretimini desteklemelidir.

## Önerilen sonraki aşamalar

1. Stateless MySQL connector referans implementasyonu.
2. Bağlantı testi, profil düzenleme ve silme ekranları.
3. SQL editörünü `/v1/query` fonksiyonuna bağlama.
4. Şifreli vault export/import ve opsiyonel zero-knowledge sync.
5. CSP, Trusted Types ve connector origin allowlist.
6. Read-only oturum, sorgu timeout'u ve maksimum satır/byte limitleri.
