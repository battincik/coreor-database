import type { DatabaseCatalogItem, DatabaseEngine, TableInfo } from 'types';

export type SqlDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface SqlDiagnostic {
  id: string;
  severity: SqlDiagnosticSeverity;
  code: string;
  message: string;
  start: number;
  end: number;
  suggestion?: string;
}

export interface SqlLanguageContext {
  engine: DatabaseEngine;
  currentDatabase: string | null;
  databases: DatabaseCatalogItem[];
  tableInfo: Record<string, TableInfo>;
}

interface TableReference {
  databaseName: string | null;
  tableName: string;
  alias: string;
  start: number;
  end: number;
}

const KEYWORDS = new Set([
  'SELECT','DISTINCT','FROM','WHERE','AND','OR','NOT','NULL','TRUE','FALSE','JOIN','INNER','LEFT','RIGHT','FULL','OUTER','CROSS','ON','GROUP','BY','HAVING','ORDER','ASC','DESC','LIMIT','OFFSET','TOP','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','ALTER','DROP','TRUNCATE','TABLE','VIEW','INDEX','UNIQUE','COUNT','SUM','AVG','MIN','MAX','CASE','WHEN','THEN','ELSE','END','AS','IN','BETWEEN','LIKE','ILIKE','EXISTS','UNION','ALL','WITH','RECURSIVE','EXPLAIN','SHOW','DESCRIBE','BEGIN','COMMIT','ROLLBACK','RETURNING','OUTPUT','MERGE','USING','OVER','PARTITION','WINDOW','FETCH','NEXT','ROWS','ONLY'
]);

function stripQuotes(value: string) {
  return value.replace(/^[`"\[]|[`"\]]$/g, '');
}

function splitQualified(value: string) {
  const parts = value.split('.').map(stripQuotes).filter(Boolean);
  return parts.length > 1
    ? { databaseName: parts.slice(0, -1).join('.'), tableName: parts.at(-1) || '' }
    : { databaseName: null, tableName: parts[0] || '' };
}

function maskStringsAndComments(sql: string) {
  const chars = [...sql];
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const next = chars[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      else chars[index] = ' ';
      continue;
    }
    if (blockComment) {
      chars[index] = ' ';
      if (char === '*' && next === '/') {
        chars[index + 1] = ' ';
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && char === '-' && next === '-') {
      chars[index] = chars[index + 1] = ' ';
      lineComment = true;
      index += 1;
      continue;
    }
    if (!quote && char === '/' && next === '*') {
      chars[index] = chars[index + 1] = ' ';
      blockComment = true;
      index += 1;
      continue;
    }
    if (!quote && (char === "'" || char === '"' || char === '`')) {
      quote = char;
      chars[index] = ' ';
      continue;
    }
    if (quote) {
      chars[index] = ' ';
      if (char === quote && sql[index - 1] !== '\\') quote = null;
    }
  }
  return { masked: chars.join(''), unterminatedQuote: quote };
}

function findTableReferences(masked: string): TableReference[] {
  const result: TableReference[] = [];
  const regex = /\b(?:FROM|JOIN|UPDATE|INTO|TABLE|USING)\s+((?:[`"\[]?[A-Za-z_$][\w$-]*[`"\]]?\.)?[`"\[]?[A-Za-z_$][\w$-]*[`"\]]?)(?:\s+(?:AS\s+)?([A-Za-z_$][\w$-]*))?/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(masked))) {
    const qualified = splitQualified(match[1]);
    const candidateAlias = match[2];
    const alias = candidateAlias && !KEYWORDS.has(candidateAlias.toUpperCase()) ? candidateAlias : qualified.tableName;
    const start = match.index + match[0].indexOf(match[1]);
    result.push({ ...qualified, alias, start, end: start + match[1].length });
  }
  return result;
}

function findDatabase(context: SqlLanguageContext, name: string | null) {
  const target = name || context.currentDatabase;
  return context.databases.find(database => database.name.toLocaleLowerCase('tr-TR') === target?.toLocaleLowerCase('tr-TR')) || null;
}

function tableExists(context: SqlLanguageContext, reference: TableReference) {
  const database = findDatabase(context, reference.databaseName);
  return Boolean(database?.tables.some(table => table.toLocaleLowerCase('tr-TR') === reference.tableName.toLocaleLowerCase('tr-TR')));
}

function columnsFor(context: SqlLanguageContext, reference: TableReference) {
  const direct = context.tableInfo[reference.tableName];
  if (direct) return direct.columns.map(column => column.Field);
  const lower = reference.tableName.toLocaleLowerCase('tr-TR');
  const entry = Object.entries(context.tableInfo).find(([name]) => name.toLocaleLowerCase('tr-TR') === lower);
  return entry?.[1].columns.map(column => column.Field) || [];
}

function diagnostic(id: string, severity: SqlDiagnosticSeverity, code: string, message: string, start: number, end: number, suggestion?: string): SqlDiagnostic {
  return { id, severity, code, message, start: Math.max(0, start), end: Math.max(start + 1, end), suggestion };
}

export function analyzeSqlDocument(sql: string, context: SqlLanguageContext): SqlDiagnostic[] {
  const diagnostics: SqlDiagnostic[] = [];
  const { masked, unterminatedQuote } = maskStringsAndComments(sql);
  if (unterminatedQuote) diagnostics.push(diagnostic('quote', 'error', 'UNTERMINATED_STRING', 'Kapatılmamış string veya identifier tırnağı var.', Math.max(0, sql.lastIndexOf(unterminatedQuote)), sql.length, 'Eksik tırnağı kapatın.'));

  let depth = 0;
  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index] === '(') depth += 1;
    if (masked[index] === ')') {
      depth -= 1;
      if (depth < 0) {
        diagnostics.push(diagnostic(`paren:${index}`, 'error', 'UNEXPECTED_PAREN', 'Beklenmeyen kapanış parantezi.', index, index + 1));
        depth = 0;
      }
    }
  }
  if (depth > 0) diagnostics.push(diagnostic('paren-open', 'error', 'UNCLOSED_PAREN', `${depth} parantez kapatılmamış.`, Math.max(0, sql.lastIndexOf('(')), sql.length));

  const references = findTableReferences(masked);
  for (const reference of references) {
    if (!tableExists(context, reference)) diagnostics.push(diagnostic(`table:${reference.start}`, 'error', 'UNKNOWN_TABLE', `${reference.databaseName ? `${reference.databaseName}.` : ''}${reference.tableName} yerel katalogda bulunamadı.`, reference.start, reference.end, 'Kataloğu yenileyin veya tablo adını kontrol edin.'));
  }

  const aliasMap = new Map(references.map(reference => [reference.alias.toLocaleLowerCase('tr-TR'), reference]));
  const qualifiedColumnRegex = /\b([A-Za-z_$][\w$-]*)\.([A-Za-z_$][\w$-]*)\b/g;
  let qualified: RegExpExecArray | null;
  while ((qualified = qualifiedColumnRegex.exec(masked))) {
    const alias = qualified[1].toLocaleLowerCase('tr-TR');
    const column = qualified[2];
    const reference = aliasMap.get(alias);
    if (!reference) continue;
    const columns = columnsFor(context, reference);
    if (columns.length && !columns.some(value => value.toLocaleLowerCase('tr-TR') === column.toLocaleLowerCase('tr-TR'))) {
      const start = qualified.index + qualified[0].lastIndexOf(column);
      diagnostics.push(diagnostic(`column:${start}`, 'error', 'UNKNOWN_COLUMN', `${qualified[1]}.${column} kolonu tabloda bulunamadı.`, start, start + column.length));
    }
  }

  const columnOwners = new Map<string, string[]>();
  for (const reference of references) {
    for (const column of columnsFor(context, reference)) {
      const key = column.toLocaleLowerCase('tr-TR');
      columnOwners.set(key, [...(columnOwners.get(key) || []), reference.alias]);
    }
  }
  if (references.length > 1) {
    for (const [column, owners] of columnOwners) {
      if (owners.length < 2) continue;
      const regex = new RegExp(`(?<![.\\w])${column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(masked))) {
        const before = masked.slice(Math.max(0, match.index - 12), match.index).toUpperCase();
        if (/\b(?:FROM|JOIN|AS)\s*$/.test(before)) continue;
        diagnostics.push(diagnostic(`ambiguous:${column}:${match.index}`, 'warning', 'AMBIGUOUS_COLUMN', `${match[0]} birden fazla tabloda bulunuyor: ${owners.join(', ')}.`, match.index, match.index + match[0].length, `${owners[0]}.${match[0]} biçimini kullanın.`));
      }
    }
  }

  const trimmed = masked.trim();
  if (/^SELECT\s+\*/i.test(trimmed)) diagnostics.push(diagnostic('select-star', 'info', 'SELECT_STAR', 'SELECT * yalnız gerekli kolonları seçmeye göre daha fazla veri taşıyabilir.', masked.search(/\*/), masked.search(/\*/) + 1, 'Kullanılan kolonları açıkça yazın.'));
  if (/^(UPDATE|DELETE)\b/i.test(trimmed) && !/\bWHERE\b/i.test(trimmed)) diagnostics.push(diagnostic('unsafe-write', 'error', 'MISSING_WHERE', 'UPDATE/DELETE sorgusunda WHERE bulunmuyor.', 0, Math.min(sql.length, 20), 'Dry-run ve WHERE koşulu ekleyin.'));
  if (/^SELECT\b/i.test(trimmed) && !/\b(?:LIMIT|TOP|FETCH\s+NEXT)\b/i.test(trimmed)) diagnostics.push(diagnostic('limit', 'info', 'UNBOUNDED_SELECT', 'Sorguda görünür bir satır sınırı yok; API güvenli üst sınır uygular.', 0, Math.min(sql.length, 12)));
  if (context.engine === 'mssql' && /\bLIMIT\s+\d+/i.test(trimmed)) diagnostics.push(diagnostic('mssql-limit', 'error', 'ENGINE_SYNTAX', 'SQL Server LIMIT kullanmaz.', masked.search(/\bLIMIT\b/i), masked.search(/\bLIMIT\b/i) + 5, 'TOP veya OFFSET/FETCH kullanın.'));
  if ((context.engine === 'mysql' || context.engine === 'mariadb' || context.engine === 'tidb') && /\bRETURNING\b/i.test(trimmed)) diagnostics.push(diagnostic('mysql-returning', 'warning', 'ENGINE_SYNTAX', 'Bu motor/sürüm profilinde RETURNING desteklenmeyebilir.', masked.search(/\bRETURNING\b/i), masked.search(/\bRETURNING\b/i) + 9));
  if ((context.engine === 'postgresql' || context.engine === 'cockroachdb') && /\bTOP\s+\d+/i.test(trimmed)) diagnostics.push(diagnostic('pg-top', 'error', 'ENGINE_SYNTAX', 'PostgreSQL/CockroachDB TOP kullanmaz.', masked.search(/\bTOP\b/i), masked.search(/\bTOP\b/i) + 3, 'LIMIT kullanın.'));

  return diagnostics.sort((left, right) => {
    const severity = { error: 0, warning: 1, info: 2 };
    return severity[left.severity] - severity[right.severity] || left.start - right.start;
  }).slice(0, 50);
}
