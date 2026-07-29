'use client';

import { useEffect, useMemo, useRef } from 'react';
import { SOURCE_TRANSLATIONS, useLanguage } from '@/context/LanguageContext';

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'TD', 'TH', 'CANVAS', 'SVG']);
const TRANSLATED_ATTRIBUTES = ['placeholder', 'title', 'aria-label'] as const;

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function preserveWhitespace(source: string, translated: string) {
  const leading = source.match(/^\s*/)?.[0] ?? '';
  const trailing = source.match(/\s*$/)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

function shouldSkip(element: Element | null) {
  if (!element) return true;
  if (SKIPPED_TAGS.has(element.tagName)) return true;
  if (element.closest('[data-i18n-ignore], [contenteditable="true"], .monaco-editor, .coreor-sql-editor')) return true;
  if (element.closest('.font-mono, [data-database-value], [data-sql-value]')) return true;
  return false;
}

export function LegacyTranslationBridge() {
  const { translations, language } = useLanguage();
  const textKeysRef = useRef(new WeakMap<Text, string>());
  const attributeKeysRef = useRef(new WeakMap<Element, Map<string, string>>());
  const sourceToKey = useMemo(() => {
    const entries = Object.entries(SOURCE_TRANSLATIONS)
      .filter(([, value]) => value.length > 0 && value.length <= 180 && !value.includes('{'))
      .map(([key, value]) => [normalize(value), key] as const);
    return new Map(entries);
  }, []);

  useEffect(() => {
    const textKeys = textKeysRef.current;
    const attributeKeys = attributeKeysRef.current;
    let scheduled = false;

    const translateText = (node: Text) => {
      const parent = node.parentElement;
      if (shouldSkip(parent)) return;
      const normalized = normalize(node.data);
      if (!normalized) return;
      const key = textKeys.get(node) ?? sourceToKey.get(normalized);
      if (!key) return;
      textKeys.set(node, key);
      const translated = translations[key];
      if (!translated) return;
      const next = preserveWhitespace(node.data, translated);
      if (node.data !== next) node.data = next;
    };

    const translateAttributes = (element: Element) => {
      if (shouldSkip(element)) return;
      let keys = attributeKeys.get(element);
      for (const attribute of TRANSLATED_ATTRIBUTES) {
        const current = element.getAttribute(attribute);
        if (!current) continue;
        const knownKey = keys?.get(attribute) ?? sourceToKey.get(normalize(current));
        if (!knownKey) continue;
        if (!keys) {
          keys = new Map();
          attributeKeys.set(element, keys);
        }
        keys.set(attribute, knownKey);
        const translated = translations[knownKey];
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
  }, [language, sourceToKey, translations]);

  return null;
}
