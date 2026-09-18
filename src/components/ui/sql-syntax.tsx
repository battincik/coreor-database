'use client';

import React, { useMemo, useRef } from 'react';

const KEYWORDS = new Set([
  'ADD','ALL','ALTER','AND','ANY','AS','ASC','BACKUP','BEGIN','BETWEEN','BY','CASE','CHECK','COLUMN','COMMIT','CONSTRAINT','CREATE','DATABASE','DEFAULT','DELETE','DESC','DESCRIBE','DISTINCT','DROP','ELSE','END','EXISTS','EXPLAIN','FALSE','FOREIGN','FROM','FULL','FUNCTION','GROUP','HAVING','IF','IN','INDEX','INNER','INSERT','INTO','IS','JOIN','KEY','LEFT','LIKE','LIMIT','NOT','NULL','OFFSET','ON','OR','ORDER','OUTER','PRIMARY','PROCEDURE','REFERENCES','REPLACE','RETURNING','RIGHT','ROLLBACK','SELECT','SET','SHOW','TABLE','THEN','TOP','TRANSACTION','TRIGGER','TRUE','TRUNCATE','UNION','UNIQUE','UPDATE','USE','VALUES','VIEW','WHEN','WHERE','WITH'
]);
const TYPES = new Set([
  'BIGINT','BINARY','BIT','BLOB','BOOLEAN','CHAR','DATE','DATETIME','DECIMAL','DOUBLE','ENUM','FLOAT','GEOMETRY','INT','INTEGER','JSON','MONEY','NCHAR','NTEXT','NUMERIC','NVARCHAR','REAL','SERIAL','SMALLINT','TEXT','TIME','TIMESTAMP','TINYINT','UUID','VARBINARY','VARCHAR','XML'
]);
const FUNCTIONS = new Set([
  'AVG','COALESCE','CONCAT','COUNT','CURRENT_DATE','CURRENT_TIME','CURRENT_TIMESTAMP','DATABASE','GETDATE','JSON_VALUE','LOWER','MAX','MIN','NOW','ROUND','SUM','UPPER','UUID'
]);

export type SqlTokenKind = 'plain' | 'keyword' | 'type' | 'function' | 'string' | 'number' | 'comment' | 'identifier' | 'operator' | 'parameter';
export interface SqlToken { kind: SqlTokenKind; value: string }

export function tokenizeSql(source: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;
  const push = (kind: SqlTokenKind, value: string) => tokens.push({ kind, value });

  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) { push('plain', whitespace[0]); index += whitespace[0].length; continue; }
    const lineComment = rest.match(/^(--[^\n]*|#[^\n]*)/);
    if (lineComment) { push('comment', lineComment[0]); index += lineComment[0].length; continue; }
    if (rest.startsWith('/*')) {
      const end = source.indexOf('*/', index + 2);
      const value = source.slice(index, end === -1 ? source.length : end + 2);
      push('comment', value); index += value.length; continue;
    }
    const quote = source[index];
    if (quote === "'" || quote === '"') {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === quote) {
          if (source[cursor + 1] === quote) { cursor += 2; continue; }
          cursor += 1; break;
        }
        if (source[cursor] === '\\') cursor += 2; else cursor += 1;
      }
      const value = source.slice(index, cursor); push('string', value); index = cursor; continue;
    }
    if (quote === '`' || quote === '[') {
      const closing = quote === '[' ? ']' : '`';
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === closing) { cursor += 1; break; }
        cursor += 1;
      }
      const value = source.slice(index, cursor); push('identifier', value); index = cursor; continue;
    }
    const parameter = rest.match(/^([?:@$][A-Za-z0-9_]*)/);
    if (parameter) { push('parameter', parameter[0]); index += parameter[0].length; continue; }
    const number = rest.match(/^(?:0x[0-9a-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
    if (number) { push('number', number[0]); index += number[0].length; continue; }
    const word = rest.match(/^[A-Za-z_][A-Za-z0-9_$]*/);
    if (word) {
      const upper = word[0].toUpperCase();
      const next = source.slice(index + word[0].length).match(/^\s*\(/);
      push(KEYWORDS.has(upper) ? 'keyword' : TYPES.has(upper) ? 'type' : FUNCTIONS.has(upper) || next ? 'function' : 'plain', word[0]);
      index += word[0].length; continue;
    }
    const operator = rest.match(/^(<>|!=|<=|>=|::|:=|->>|->|&&|\|\||[-+*/%=<>&|^~.,;()])/);
    if (operator) { push('operator', operator[0]); index += operator[0].length; continue; }
    push('plain', source[index]); index += 1;
  }
  return tokens;
}

const TOKEN_CLASS: Record<SqlTokenKind, string> = {
  plain: 'text-[var(--sql-plain)]',
  keyword: 'text-[var(--sql-keyword)]',
  type: 'text-[var(--sql-type)]',
  function: 'text-[var(--sql-function)]',
  string: 'text-[var(--sql-string)]',
  number: 'text-[var(--sql-number)]',
  comment: 'text-[var(--sql-comment)]',
  identifier: 'text-[var(--sql-identifier)]',
  operator: 'text-[var(--sql-operator)]',
  parameter: 'text-[var(--sql-parameter)]'
};

export function SqlHighlightedText({ sql }: { sql: string }) {
  const tokens = useMemo(() => tokenizeSql(sql), [sql]);
  return <>{tokens.map((token, index) => <span key={`${index}-${token.kind}`} className={TOKEN_CLASS[token.kind]}>{token.value}</span>)}</>;
}

export function SqlCodeBlock({ sql, className = '' }: { sql: string; className?: string }) {
  return <pre className={`coreor-sql-syntax overflow-auto whitespace-pre font-mono text-[11px] leading-5 ${className}`}><code><SqlHighlightedText sql={sql} /></code></pre>;
}

// Backward-compatible wrapper for call sites that still pass `code`.
export function SqlCode({ code, className = '' }: { code: string; className?: string }) {
  return <SqlCodeBlock sql={code} className={className} />;
}

export function SqlEditor({
  value,
  onChange,
  onCursorChange,
  onKeyDown,
  onContextMenu,
  placeholder,
  className = ''
}: {
  value: string;
  onChange: (value: string, cursor: number) => void;
  onCursorChange?: (cursor: number) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
}) {
  const preRef = useRef<HTMLPreElement | null>(null);
  const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    if (!preRef.current) return;
    preRef.current.scrollTop = event.currentTarget.scrollTop;
    preRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };
  const updateCursor = (element: HTMLTextAreaElement) => onCursorChange?.(element.selectionStart);

  return (
    <div className={`coreor-sql-syntax coreor-sql-editor-stack relative h-full min-h-0 overflow-hidden bg-[var(--coreor-editor-bg)] ${className}`}>
      <pre ref={preRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre p-3 font-mono text-[length:var(--coreor-editor-font-size)] font-normal not-italic leading-[var(--coreor-line-height)]" style={{ tabSize: 2, fontVariantLigatures: 'none' }}><SqlHighlightedText sql={value || `${placeholder || ''}`} />{value.endsWith('\n') ? '\n ' : ''}</pre>
      <textarea
        value={value}
        spellCheck={false}
        wrap="off"
        aria-label="SQL sorgu editörü"
        placeholder={placeholder}
        className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre border-0 bg-transparent p-3 font-mono text-[length:var(--coreor-editor-font-size)] font-normal not-italic leading-[var(--coreor-line-height)] text-transparent caret-[var(--sql-caret)] outline-none selection:bg-[var(--coreor-editor-selection)] placeholder:text-zinc-700"
        style={{ tabSize: 2, fontVariantLigatures: 'none' }}
        onChange={event => onChange(event.target.value, event.currentTarget.selectionStart)}
        onClick={event => updateCursor(event.currentTarget)}
        onSelect={event => updateCursor(event.currentTarget)}
        onKeyDown={onKeyDown}
        onContextMenu={onContextMenu}
        onScroll={syncScroll}
      />
    </div>
  );
}
