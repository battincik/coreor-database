'use client';

import { useEffect, useMemo, useRef } from 'react';
import { SOURCE_TRANSLATIONS, useLanguage } from '@/context/LanguageContext';
import { APP_VERSION_LABEL } from '@/lib/appVersion';

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'TD', 'CANVAS', 'SVG']);
const TRANSLATED_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'aria-description', 'data-tooltip', 'data-title'] as const;
const VERSION_LABEL_PATTERN = /^Coreor Database v\d+\.\d+\.\d+$/;
const PLACEHOLDER_PATTERN = /\{([A-Za-z0-9_]+)\}/g;
const TRAILING_PUNCTUATION_PATTERN = /([.!?…:;]+)$/u;
const SQL_KEYWORDS = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'REPLACE', 'MERGE', 'CALL', 'EXPLAIN']);

interface TemplateMatcher {
  key: string;
  pattern: RegExp;
  placeholders: string[];
}

interface SourceRecord {
  source: string;
  key?: string;
}

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function preserveWhitespace(source: string, translated: string) {
  const leading = source.match(/^\s*/)?.[0] ?? '';
  const trailing = source.match(/\s*$/)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function interpolate(template: string, values: Record<string, string>) {
  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) => values[key] ?? match);
}

function compileTemplate(key: string, source: string): TemplateMatcher | null {
  const placeholders: string[] = [];
  let cursor = 0;
  let expression = '';
  for (const match of source.matchAll(PLACEHOLDER_PATTERN)) {
    const index = match.index ?? 0;
    expression += escapeRegExp(source.slice(cursor, index));
    expression += '(.+?)';
    placeholders.push(match[1]);
    cursor = index + match[0].length;
  }
  if (!placeholders.length) return null;
  expression += escapeRegExp(source.slice(cursor));
  return { key, placeholders, pattern: new RegExp(`^${expression}$`, 'u') };
}

function shouldSkip(element: Element | null) {
  if (!element) return true;
  if (SKIPPED_TAGS.has(element.tagName)) return true;
  if (element.closest('[data-i18n-ignore], [contenteditable="true"], .monaco-editor, .coreor-sql-editor')) return true;
  if (element.closest('.font-mono, [data-database-value], [data-sql-value]')) return true;
  return false;
}

function contextualScore(key: string, element: Element | null, attribute?: string) {
  let score = 0;
  const role = element?.getAttribute('role');
  if (attribute === 'title' || attribute === 'aria-description' || attribute === 'data-tooltip') {
    if (key.startsWith('tooltip.')) score += 20;
  }
  if (role === 'combobox' || role === 'listbox' || element?.getAttribute('aria-haspopup') === 'listbox') {
    if (key.startsWith('control.select.')) score += 20;
  }
  if (key.startsWith('sql.keyword.')) score -= 20;
  return score;
}

function chooseKey(keys: string[], element: Element | null, attribute?: string) {
  return [...keys].sort((left, right) => contextualScore(right, element, attribute) - contextualScore(left, element, attribute))[0];
}

function explicitAttributeKey(element: Element, attribute: string) {
  const suffix = attribute.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  return element.getAttribute(`data-i18n-${attribute}`) ?? element.getAttribute(`data-i18n-${suffix}`);
}

export function LegacyTranslationBridge() {
  const { translations, language } = useLanguage();
  const textSourcesRef = useRef(new WeakMap<Text, SourceRecord>());
  const attributeSourcesRef = useRef(new WeakMap<Element, Map<string, SourceRecord>>());

  const lookup = useMemo(() => {
    const exact = new Map<string, string[]>();
    const templates: TemplateMatcher[] = [];

    for (const [key, value] of Object.entries(SOURCE_TRANSLATIONS)) {
      const source = normalize(value);
      if (!source || source.length > 220) continue;
      const template = compileTemplate(key, source);
      if (template) {
        templates.push(template);
        continue;
      }
      const keys = exact.get(source) ?? [];
      keys.push(key);
      exact.set(source, keys);
    }

    templates.sort((left, right) => right.pattern.source.length - left.pattern.source.length);
    return { exact, templates };
  }, []);

  useEffect(() => {
    const textSources = textSourcesRef.current;
    const attributeSources = attributeSourcesRef.current;
    let scheduled = false;

    const translateSource = (sourceValue: string, element: Element | null, attribute?: string, explicitKey?: string) => {
      const source = normalize(sourceValue);
      if (!source) return null;
      if (SQL_KEYWORDS.has(source)) return source;

      if (explicitKey) {
        const explicitTranslation = translations[explicitKey];
        if (explicitTranslation) return explicitTranslation;
      }

      const directKeys = lookup.exact.get(source);
      if (directKeys?.length) return translations[chooseKey(directKeys, element, attribute)] ?? null;

      for (const matcher of lookup.templates) {
        const match = source.match(matcher.pattern);
        if (!match) continue;
        const values = Object.fromEntries(matcher.placeholders.map((placeholder, index) => [placeholder, match[index + 1]]));
        const template = translations[matcher.key];
        if (template) return interpolate(template, values);
      }

      const punctuation = source.match(TRAILING_PUNCTUATION_PATTERN)?.[1];
      if (punctuation) {
        const base = source.slice(0, -punctuation.length);
        const baseKeys = lookup.exact.get(base);
        if (baseKeys?.length) {
          const translated = translations[chooseKey(baseKeys, element, attribute)];
          if (translated) return TRAILING_PUNCTUATION_PATTERN.test(translated) ? translated : `${translated}${punctuation}`;
        }
      }

      return null;
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

      const existing = textSources.get(node);
      const source = existing?.source ?? node.data;
      const explicitKey = existing?.key ?? parent?.getAttribute('data-i18n-key') ?? undefined;
      const translated = translateSource(source, parent, undefined, explicitKey);
      if (!translated) return;
      if (!existing) textSources.set(node, { source, key: explicitKey });
      const next = preserveWhitespace(node.data, translated);
      if (node.data !== next) node.data = next;
    };

    const translateAttributes = (element: Element) => {
      if (shouldSkip(element)) return;
      let records = attributeSources.get(element);
      for (const attribute of TRANSLATED_ATTRIBUTES) {
        const current = element.getAttribute(attribute);
        if (!current) continue;
        const existing = records?.get(attribute);
        const source = existing?.source ?? current;
        const explicitKey = existing?.key ?? explicitAttributeKey(element, attribute) ?? undefined;
        const translated = translateSource(source, element, attribute, explicitKey);
        if (!translated) continue;
        if (!records) {
          records = new Map();
          attributeSources.set(element, records);
        }
        if (!existing) records.set(attribute, { source, key: explicitKey });
        if (current !== translated) element.setAttribute(attribute, translated);
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
      attributeFilter: [...TRANSLATED_ATTRIBUTES, 'data-i18n-key', ...TRANSLATED_ATTRIBUTES.map(attribute => `data-i18n-${attribute}`)]
    });
    return () => observer.disconnect();
  }, [language, lookup, translations]);

  return null;
}
