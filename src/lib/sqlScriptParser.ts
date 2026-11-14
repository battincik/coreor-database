/** Parse SQL scripts with MySQL CLI DELIMITER directives, never sending them to the server. */
export interface SqlScriptStatement { sql: string; startLine: number }
export interface ParsedSqlScript { statements: SqlScriptStatement[]; errors: string[] }

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(?:^|\n)[ \t]*--[ \t][^\r\n]*/g, ' ')
    .replace(/(?:^|\n)[ \t]*#[^\r\n]*/g, ' ').trim();
}
export function parseSqlScript(source: string, allowDelimiter = true): ParsedSqlScript {
  const statements: SqlScriptStatement[] = [];
  const errors: string[] = [];
  let current = '', delimiter = ';', quote: string | null = null;
  let lineComment = false, blockComment = false, lineOnlyWhitespace = true;
  let line = 1, statementLine = 1;
  const backtick = String.fromCharCode(96);
  function add(value: string) {
    current += value;
    for (const ch of value) {
      if (ch === '\n') { line += 1; lineOnlyWhitespace = true; }
      else if (ch !== ' ' && ch !== '\t' && ch !== '\r') lineOnlyWhitespace = false;
    }
  }
  function flush() {
    if (withoutComments(current)) statements.push({ sql: current.trim(), startLine: statementLine });
    current = '';
    statementLine = line;
  }
  for (let i = 0; i < source.length;) {
    if (!quote && !blockComment && !lineComment && lineOnlyWhitespace) {
      const directive = /^[ \t]*DELIMITER(?:[ \t]+([^\s]+))?[ \t]*(?:\r?\n|$)/i.exec(source.slice(i));
      if (directive) {
        if (withoutComments(current)) errors.push('Line ' + line + ': DELIMITER inside an unfinished SQL statement.');
        else {
          current = '';
          const replacement = directive[1];
          if (!allowDelimiter) errors.push('Line ' + line + ': DELIMITER is supported only for MySQL-compatible connections.');
          else if (!replacement || replacement.length > 32 || replacement.includes(backtick) || /['"]/.test(replacement)) {
            errors.push('Line ' + line + ': invalid DELIMITER value.');
          } else delimiter = replacement;
        }
        for (const ch of directive[0]) if (ch === '\n') line += 1;
        i += directive[0].length;
        lineOnlyWhitespace = true;
        statementLine = line;
        continue;
      }
    }
    const ch = source[i], next = source[i + 1];
    if (lineComment) { add(ch); i++; if (ch === '\n') lineComment = false; continue; }
    if (blockComment) {
      if (ch === '*' && next === '/') { add('*/'); i += 2; blockComment = false; }
      else { add(ch); i++; }
      continue;
    }
    if (quote) {
      if (ch === '\\' && next !== undefined) { add(ch + next); i += 2; continue; }
      if (ch === quote && next === quote) { add(ch + next); i += 2; continue; }
      add(ch); i++;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '*') { blockComment = true; add('/*'); i += 2; continue; }
    if ((ch === '-' && next === '-' && (source[i + 2] === undefined || /\s/.test(source[i + 2]))) || ch === '#') {
      lineComment = true; const prefix = ch === '#' ? '#' : '--'; add(prefix); i += prefix.length; continue;
    }
    if (ch === "'" || ch === '"' || ch === backtick) { quote = ch; add(ch); i++; continue; }
    if (delimiter && source.startsWith(delimiter, i)) { flush(); i += delimiter.length; continue; }
    add(ch); i++;
  }
  if (quote) errors.push('Line ' + line + ': unterminated string or identifier.');
  if (blockComment) errors.push('Line ' + line + ': unterminated block comment.');
  if (withoutComments(current) && delimiter !== ';') errors.push('Line ' + line + ': statement not terminated by DELIMITER ' + delimiter + '.');
  if (withoutComments(current)) flush();
  return { statements, errors };
}
