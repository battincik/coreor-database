import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSqlScript } from '../src/lib/sqlScriptParser.ts';
const parse = text => parseSqlScript(text);

test('keeps BEGIN END routine and IF body as one SQL statement', () => {
  const source = [
    '-- migration',
    'CREATE TABLE IF NOT EXISTS migration_state(id INT);',
    'DELIMITER $$',
    'CREATE PROCEDURE migrate_once()',
    'BEGIN',
    ' IF NOT EXISTS (SELECT 1 FROM migration_state) THEN',
    '   UPDATE workspace_device_locations SET speedKmh=ROUND(speedMps*3.6,2);',
    '   INSERT INTO migration_state VALUES (1);',
    ' END IF;',
    'END$$',
    'DELIMITER ;',
    'CALL migrate_once();',
    'DROP PROCEDURE migrate_once();',
    'SELECT * FROM migration_state;'
  ].join('\n');
  const result = parse(source);
  assert.deepEqual(result.errors, []);
  assert.equal(result.statements.length, 5);
  assert.match(result.statements[1].sql, /^CREATE PROCEDURE migrate_once/);
  assert.match(result.statements[1].sql, /END IF;\s*END$/);
  assert.ok(!result.statements.some(s => /^DELIMITER/i.test(s.sql)));
  assert.equal(result.statements[1].startLine, 4);
});
test('handles PREPARE/EXECUTE/DEALLOCATE and quoted semicolons', () => {
  const result = parse("SET @sql = 'SELECT ;'; PREPARE loc_stmt FROM @sql; EXECUTE loc_stmt; DEALLOCATE PREPARE loc_stmt;");
  assert.deepEqual(result.errors, []);
  assert.equal(result.statements.length, 4);
});
test('handles comments, quoted delimiters, custom separator and multiline procedure', () => {
  const source = [
    '/* leading ; */',
    'DELIMITER //',
    'CREATE PROCEDURE p() BEGIN',
    " SELECT ';' AS a, '//' AS b;",
    ' /* comment // not delimiter */ SELECT 2;',
    'END//',
    'DELIMITER ;',
    'SELECT 3;'
  ].join('\n');
  const result = parse(source);
  assert.deepEqual(result.errors, []);
  assert.equal(result.statements.length, 2);
  assert.match(result.statements[0].sql, /SELECT 2;\s*END$/);
});
test('skips comment-only chunks', () => {
  const r = parse('-- header\n# standalone\n/* block */\nSELECT 1; /* between */ SELECT 2;');
  assert.deepEqual(r.errors, []);
  assert.equal(r.statements.length, 2);
});
test('invalid directive produces an error without sending DELIMITER as SQL', () => {
  const r = parse('DELIMITER\nSELECT 1;');
  assert.ok(r.errors.length);
  assert.equal(r.statements.length, 1);
  assert.ok(!r.statements[0].sql.includes('DELIMITER'));
});
test('unfinished custom-delimited script is blocked', () => {
  assert.match(parse('DELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT 1; END;').errors.join(' '), /not terminated/);
});
test('DELIMITER is rejected on unsupported engines', () => {
  assert.match(parseSqlScript('DELIMITER $$\nSELECT 1$$', false).errors.join(' '), /MySQL/);
});
