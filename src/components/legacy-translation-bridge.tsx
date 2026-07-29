'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  interpolateTranslation,
  SOURCE_TRANSLATIONS,
  type TranslationValues,
  useLanguage
} from '@/context/LanguageContext';
import { APP_VERSION_LABEL } from '@/lib/appVersion';

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'TD', 'CANVAS', 'SVG']);
const TRANSLATED_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'aria-description', 'data-placeholder', 'data-empty-text'] as const;
const VERSION_LABEL_PATTERN = /^Coreor Database v\d+\.\d+\.\d+$/;
const TURKISH_UI_PATTERN = /[çğıİöşüÇĞÖŞÜ]|\b(?:ayarlar?|sunucu|veritabanı|tablo|sorgu|bağlantı|yükleniyor|bulunamadı|oluştur|düzenle|kapat|satır|sütun|kolon|şema|yedekleme|güvenlik|geçmiş|yenile|temizle|karşılaştırma|maskeleme)\b/i;

interface TranslationMatch {
  key: string;
  values?: TranslationValues;
}

interface TemplateMatcher {
  key: string;
  names: string[];
  pattern: RegExp;
}

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function preserveWhitespace(source: string, translated: string) {
  const leading = source.match(/^\s*/)?.[0] ?? '';
  const trailing = source.match(/\s*$/)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileTemplate(key: string, source: string): TemplateMatcher | null {
  const names: string[] = [];
  let cursor = 0;
  let expression = '';
  const placeholder = /\{([A-Za-z0-9_]+)\}/g;
  let match = placeholder.exec(source);
  while (match) {
    expression += escapeRegex(source.slice(cursor, match.index));
    expression += '(.+?)';
    names.push(match[1]);
    cursor = match.index + match[0].length;
    match = placeholder.exec(source);
  }
  if (!names.length) return null;
  expression += escapeRegex(source.slice(cursor));
  return { key, names, pattern: new RegExp(`^${expression}$`, 'u') };
}

function shouldSkip(element: Element | null) {
  if (!element) return true;
  if (SKIPPED_TAGS.has(element.tagName)) return true;
  if (element.closest('[data-i18n-ignore], [data-user-content], [contenteditable="true"], .monaco-editor, .coreor-sql-editor')) return true;
  if (element.closest('.font-mono, [data-database-value], [data-sql-value]')) return true;
  return false;
}

function canAudit(element: Element | null) {
  if (!element || shouldSkip(element)) return false;
  return Boolean(element.closest('button, a, label, [role="menuitem"], [role="tab"], [role="dialog"], [role="alert"], h1, h2, h3, h4, h5, h6, th, legend'));
}

export function LegacyTranslationBridge() {
  const { translations, language } = useLanguage();
  const textMatchesRef = useRef(new WeakMap<Text, TranslationMatch>());
  const attributeMatchesRef = useRef(new WeakMap<Element, Map<string, TranslationMatch>>());
  const missingRef = useRef(new Set<string>());

  const catalog = useMemo(() => {
    const exact = new Map<string, string>();
    const templates: TemplateMatcher[] = [];
    for (const [key, value] of Object.entries(SOURCE_TRANSLATIONS)) {
      if (!value || value.length > 240) continue;
      const normalized = normalize(value);
      const template = compileTemplate(key, normalized);
      if (template) templates.push(template);
      else exact.set(normalized, key);
    }
    templates.sort((left, right) => right.pattern.source.length - left.pattern.source.length);
    return { exact, templates };
  }, []);

  useEffect(() => {
    const textMatches = textMatchesRef.current;
    const attributeMatches = attributeMatchesRef.current;
    const missing = missingRef.current;
    let scheduled = false;

    const resolveMatch = (value: string): TranslationMatch | null => {
      const normalized = normalize(value);
      const exactKey = catalog.exact.get(normalized);
      if (exactKey) return { key: exactKey };
      for (const template of catalog.templates) {
        const match = normalized.match(template.pattern);
        if (!match) continue;
        const values: TranslationValues = {};
        template.names.forEach((name, index) => {
          values[name] = match[index + 1];
        });
        return { key: template.key, values };
      }
      return null;
    };

    const translatedValue = (match: TranslationMatch) => {
      const template = translations[match.key];
      return template ? interpolateTranslation(template, match.values) : null;
    };

    const reportMissing = (value: string, element: Element | null) => {
      if (process.env.NODE_ENV === 'production' || language === 'tr' || !canAudit(element)) return;
      const normalized = normalize(value);
      if (!normalized || normalized.length > 240 || !TURKISH_UI_PATTERN.test(normalized)) return;
      missing.add(normalized);
      const target = window as typeof window & { __coreorUntranslatedUI?: string[] };
      target.__coreorUntranslatedUI = [...missing].sort((left, right) => left.localeCompare(right, 'tr'));
    };

    const translateText = (node: Text) => {
      const parent = node.parentElement;
      if (shouldSkip(parent)) return;
      const normalized = normalize(node.data);
      if (!normalized) return;
      if (VERSION_LABEL_PATTERN.test(normalized)) {
        const nextVersion = preserveWhitespace(node.data, APP_VERSION_LABEL);
        if (node.data !== nextVersion) node.data = nextVersion;
        return;
      }
      const match = textMatches.get(node) ?? resolveMatch(normalized);
      if (!match) {
        reportMissing(normalized, parent);
        return;
      }
      textMatches.set(node, match);
      const translated = translatedValue(match);
      if (!translated) return;
      const next = preserveWhitespace(node.data, translated);
      if (node.data !== next) node.data = next;
    };

    const translateAttributes = (element: Element) => {
      if (shouldSkip(element)) return;
      let matches = attributeMatches.get(element);
      for (const attribute of TRANSLATED_ATTRIBUTES) {
        const current = element.getAttribute(attribute);
        if (!current) continue;
        const match = matches?.get(attribute) ?? resolveMatch(current);
        if (!match) {
          reportMissing(current, element);
          continue;
        }
        if (!matches) {
          matches = new Map();
          attributeMatches.set(element, matches);
        }
        matches.set(attribute, match);
        const translated = translatedValue(match);
        if (translated && current !== translated) element.setAttribute(attribute, translated);
      }
    };

    const scan = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        translateText(root as Text);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
      if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root as Element);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        if (current.nodeType === Node.TEXT_NODE) translateText(current as Text);
        else translateAttributes(current as Element);
        current = walker.nextNode();
      }
    };

    const scheduleFullScan = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        scan(document.body);
      });
    };

    scheduleFullScan();
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') translateText(record.target as Text);
        if (record.type === 'attributes') translateAttributes(record.target as Element);
        record.addedNodes.forEach(scan);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATED_ATTRIBUTES]
    });
    return () => observer.disconnect();
  }, [catalog, language, translations]);

  return null;
}
