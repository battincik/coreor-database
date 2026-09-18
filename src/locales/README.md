# Coreor Database locales

Coreor uses **JSON-only translation catalogs**. User-facing UI text belongs in locale JSON files and React components consume it with `t('namespace.key')`.

## Modern locale format

```json
{
  "meta": {
    "direction": "ltr",
    "nativeName": "English"
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel"
  },
  "topbar": {
    "connect": "Connect"
  }
}
```

Nested JSON becomes dotted keys at runtime:

```tsx
const { t } = useLanguage();
<Button>{t('common.save')}</Button>
```

Dynamic copy uses named placeholders:

```json
{ "query": { "affectedRows": "{count} rows affected" } }
```

```tsx
t('query.affectedRows', { count: 42 })
```

## Add a language

1. Copy `en.json` to `<locale>.json`.
2. Set `meta.nativeName` and `meta.direction` (`ltr` or `rtl`).
3. Translate string values without changing key structure.
4. Preserve placeholders such as `{count}`, `{name}`, and `{database}`.
5. Keep SQL keywords such as `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, and `TRUNCATE` unchanged.
6. Run:
   ```bash
   npm run i18n:generate
   npm run i18n:check
   npm run i18n:audit
   ```

No manual edit to `LanguageContext.tsx`, a TypeScript locale union, or a validator locale list is required. `registry.ts` is generated from every modern JSON locale.

## Fallback and legacy packs

- `en.json` and `tr.json` are complete source catalogs and must share the same keys/placeholders.
- Community locales may be partial. Missing keys fall back to English at runtime.
- Old flat JSON packs without `meta.nativeName` and `meta.direction` remain legacy compatibility files and are not exposed in the language picker until migrated.

## Rules

- Do not hard-code user-facing labels, descriptions, placeholders, titles, aria labels, toast text, or modal copy in components.
- Add copy to `en.json` and `tr.json` first, then call `t('namespace.key')`.
- Prefer semantic namespaces such as `sidebar.menu.*`, `maintenance.*`, and `notificationCenter.*`.
- Database values, SQL source text, engine identifiers, filenames, and protocol constants are not translated.
- JSON is UTF-8 with two-space indentation.
- `LegacyTranslationBridge` is a migration safety net only. New UI must use direct `t(...)` calls.


## Audit modes

`npm run i18n:audit` scans every TypeScript/TSX file for:
- literal `t('...')` keys missing from `en.json` or `tr.json`,
- user-facing JSX text not represented in the source JSON catalogs,
- translatable `title`, `placeholder`, `aria-*` attributes,
- menu/dialog option `label`, `title`, `description`, and `confirmLabel` values,
- uncataloged Turkish fallback copy.

Catalog-backed legacy literals remain translated by `LegacyTranslationBridge` and are reported as migration debt.

`npm run i18n:audit:strict` additionally fails on those catalog-backed legacy literals. Use it while converting old components to direct `t(...)` calls.
