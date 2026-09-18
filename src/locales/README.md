# Coreor Database locales

Her desteklenen dil tek bir JSON dosyasıyla tanımlanır. UI metinleri component içinde hardcode edilmez.

## JSON yapısı

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel"
  },
  "topbar": {
    "connect": "Connect"
  },
  "maintenance": {
    "title": "Maintenance center"
  }
}
```

React tarafında noktalı path kullanılır:

```tsx
const { t } = useLanguage();
<Button>{t('common.save')}</Button>
```

Değişken metinler placeholder kullanır:

```json
{
  "query": {
    "affectedRows": "{count} rows affected"
  }
}
```

```tsx
t('query.affectedRows', { count: 42 })
```

## Yeni dil ekleme

1. `en.json` dosyasını yeni locale adına kopyalayın.
2. Anahtar yapısını değiştirmeden yalnız string değerlerini çevirin.
3. `{count}`, `{name}` gibi placeholder'ları koruyun.
4. SQL keyword değerlerini (`SELECT`, `INSERT`, ...) çevirmeyin.
5. `LanguageContext.tsx` içinde import, `LocaleCode` ve `SUPPORTED_LANGUAGES` kayıtlarını ekleyin.
6. `scripts/validate-locales.mjs` içindeki `supportedLocales` listesine locale'i ekleyin.
7. `npm run i18n:check` çalıştırın.

## Kurallar

- Yeni kullanıcı metni önce locale JSON'larına eklenir, sonra `t('namespace.key')` ile kullanılır.
- İngilizce fallback yalnız runtime güvenlik ağıdır; eksik dil paketi validator'dan geçmez.
- Bütün locale dosyaları aynı key setine ve aynı placeholder setine sahip olmalıdır.
- JSON UTF-8 ve 2-space indentation kullanır.
