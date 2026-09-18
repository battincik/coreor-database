use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Column, Row};
use std::{fs, path::PathBuf, time::Duration};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopConfig {
    #[serde(default = "config_version")]
    version: u32,
    #[serde(default = "default_query_timeout")]
    query_timeout_ms: u64,
    #[serde(default = "default_max_rows")]
    max_result_rows: usize,
    #[serde(default = "default_page_size")]
    max_page_size: usize,
    #[serde(default)]
    connections: Vec<Value>,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self { version: 1, query_timeout_ms: default_query_timeout(), max_result_rows: default_max_rows(), max_page_size: default_page_size(), connections: Vec::new() }
    }
}

fn config_version() -> u32 { 1 }
fn default_query_timeout() -> u64 { 30_000 }
fn default_max_rows() -> usize { 5_000 }
fn default_page_size() -> usize { 500 }

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Connection {
    engine: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    database: Option<String>,
    #[serde(default = "default_ssl_mode")]
    ssl_mode: String,
    #[serde(default = "default_connect_timeout")]
    connect_timeout_ms: u64,
    #[serde(default)]
    read_only: bool,
}

fn default_ssl_mode() -> String { "required".into() }
fn default_connect_timeout() -> u64 { 20_000 }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseRequest {
    action: String,
    connection: Option<Connection>,
    #[serde(flatten)]
    payload: serde_json::Map<String, Value>,
}

fn config_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

#[tauri::command]
fn config_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(config_file(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_config(app: tauri::AppHandle) -> Result<DesktopConfig, String> {
    let path = config_file(&app)?;
    if !path.exists() {
        let config = DesktopConfig::default();
        fs::write(&path, serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        return Ok(config);
    }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_config(app: tauri::AppHandle, config: DesktopConfig) -> Result<(), String> {
    let path = config_file(&app)?;
    fs::write(path, serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn mysql_url(c: &Connection, database: Option<&str>) -> String {
    let db = database.or(c.database.as_deref()).unwrap_or("");
    let query = match c.ssl_mode.as_str() { "disabled" => "?ssl-mode=DISABLED", "preferred" => "?ssl-mode=PREFERRED", _ => "?ssl-mode=REQUIRED" };
    format!("mysql://{}:{}@{}:{}/{}{}", c.username, c.password, c.host, c.port, db, query)
}

fn postgres_url(c: &Connection, database: Option<&str>) -> String {
    let db = database.or(c.database.as_deref()).unwrap_or("postgres");
    let ssl = match c.ssl_mode.as_str() { "disabled" => "disable", "preferred" => "prefer", _ => "require" };
    format!("postgres://{}:{}@{}:{}/{}?sslmode={}", c.username, c.password, c.host, c.port, db, ssl)
}

fn cell_to_json_mysql(row: &sqlx::mysql::MySqlRow, i: usize) -> Value {
    if let Ok(v) = row.try_get::<Option<String>, _>(i) { return v.map(Value::String).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<i64>, _>(i) { return v.map(|n| json!(n)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<u64>, _>(i) { return v.map(|n| json!(n)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<f64>, _>(i) { return v.map(|n| json!(n)).unwrap_or(Value::Null); }
    Value::String("<binary>".into())
}

fn cell_to_json_pg(row: &sqlx::postgres::PgRow, i: usize) -> Value {
    if let Ok(v) = row.try_get::<Option<String>, _>(i) { return v.map(Value::String).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<i64>, _>(i) { return v.map(|n| json!(n)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<i32>, _>(i) { return v.map(|n| json!(n)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<f64>, _>(i) { return v.map(|n| json!(n)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<bool>, _>(i) { return v.map(|n| json!(n)).unwrap_or(Value::Null); }
    Value::String("<unsupported>".into())
}

async fn mysql_query(c: &Connection, sql: &str, database: Option<&str>, limit: usize) -> Result<Value, String> {
    let opts: sqlx::mysql::MySqlConnectOptions = mysql_url(c, database).parse::<sqlx::mysql::MySqlConnectOptions>().map_err(|e| e.to_string())?;
    let pool = sqlx::mysql::MySqlPoolOptions::new().max_connections(5).acquire_timeout(Duration::from_millis(c.connect_timeout_ms)).connect_with(opts).await.map_err(|e| e.to_string())?;
    if c.read_only {
        sqlx::query("SET SESSION TRANSACTION READ ONLY").execute(&pool).await.map_err(|e| e.to_string())?;
    }
    let rows = sqlx::query(sql).fetch_all(&pool).await.map_err(|e| e.to_string())?;
    let rows = rows.into_iter().take(limit).map(|row| {
        let mut obj = serde_json::Map::new();
        for (i, col) in row.columns().iter().enumerate() { obj.insert(col.name().to_string(), cell_to_json_mysql(&row, i)); }
        Value::Object(obj)
    }).collect::<Vec<_>>();
    Ok(json!({ "rows": rows, "affectedRows": 0 }))
}

async fn pg_query(c: &Connection, sql: &str, database: Option<&str>, limit: usize) -> Result<Value, String> {
    let opts: sqlx::postgres::PgConnectOptions = postgres_url(c, database).parse::<sqlx::postgres::PgConnectOptions>().map_err(|e| e.to_string())?;
    let pool = sqlx::postgres::PgPoolOptions::new().max_connections(5).acquire_timeout(Duration::from_millis(c.connect_timeout_ms)).connect_with(opts).await.map_err(|e| e.to_string())?;
    if c.read_only { sqlx::query("SET default_transaction_read_only = on").execute(&pool).await.map_err(|e| e.to_string())?; }
    let rows = sqlx::query(sql).fetch_all(&pool).await.map_err(|e| e.to_string())?;
    let rows = rows.into_iter().take(limit).map(|row| {
        let mut obj = serde_json::Map::new();
        for (i, col) in row.columns().iter().enumerate() { obj.insert(col.name().to_string(), cell_to_json_pg(&row, i)); }
        Value::Object(obj)
    }).collect::<Vec<_>>();
    Ok(json!({ "rows": rows, "affectedRows": 0 }))
}

fn sql_literal(value: &Value) -> String {
    match value {
        Value::Null => "NULL".into(),
        Value::Bool(v) => if *v { "TRUE".into() } else { "FALSE".into() },
        Value::Number(v) => v.to_string(),
        Value::String(v) => format!("'{}'", v.replace('\\'', "''")),
        _ => format!("'{}'", value.to_string().replace('\\'', "''")),
    }
}

async fn execute_action(request: DatabaseRequest, config: DesktopConfig) -> Result<Value, String> {
    let c = request.connection.ok_or_else(|| "Bağlantı bilgisi eksik.".to_string())?;
    let database = request.payload.get("database").and_then(Value::as_str);
    let sql = request.payload.get("sql").and_then(Value::as_str);
    match request.action.as_str() {
        "test" => {
            let test_sql = if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") { "SELECT version() AS version" } else { "SELECT VERSION() AS version" };
            let result = if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") { pg_query(&c, test_sql, database, 1).await? } else { mysql_query(&c, test_sql, database, 1).await? };
            Ok(json!({ "connection": { "version": result["rows"].get(0).and_then(|r| r.get("version")).cloned().unwrap_or(Value::Null), "databaseName": database }, "_meta": { "statements": [{ "label": "Bağlantı testi", "sql": test_sql }] } }))
        }
        "catalog" => {
            let sql = if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") {
                "SELECT datname AS name FROM pg_database WHERE datistemplate = false ORDER BY datname"
            } else {
                "SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME"
            };
            let result = if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") { pg_query(&c, sql, None, config.max_result_rows).await? } else { mysql_query(&c, sql, None, config.max_result_rows).await? };
            let databases = result["rows"].as_array().cloned().unwrap_or_default().into_iter().filter_map(|row| row.get("name").and_then(Value::as_str).map(|name| json!({
                "name": name, "defaultCharset": null, "defaultCollation": null, "tableCount": 0, "totalRows": 0,
                "dataSizeMB": "0.00", "indexSizeMB": "0.00", "totalSizeMB": "0.00", "tables": [], "tableDetails": []
            }))).collect::<Vec<_>>();
            Ok(json!({ "databases": databases, "_meta": { "statements": [{ "label": "Katalog", "sql": sql }] } }))
        }
        "table-data" => {
            let database = request.payload.get("database").and_then(Value::as_str).ok_or_else(|| "Veritabanı eksik.".to_string())?;
            let table = request.payload.get("table").and_then(Value::as_str).ok_or_else(|| "Tablo eksik.".to_string())?;
            let page = request.payload.get("page").and_then(Value::as_u64).unwrap_or(1).max(1);
            let page_size = request.payload.get("pageSize").and_then(Value::as_u64).unwrap_or(50).min(config.max_page_size as u64);
            let offset = (page - 1) * page_size;
            let quote = if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") { "\"" } else { "`" };
            let sql = format!("SELECT * FROM {q}{db}{q}.{q}{table}{q} LIMIT {limit} OFFSET {offset}", q=quote, db=database.replace(quote, ""), table=table.replace(quote, ""), limit=page_size, offset=offset);
            let result = if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") { pg_query(&c, &sql, Some(database), page_size as usize).await? } else { mysql_query(&c, &sql, Some(database), page_size as usize).await? };
            let data = result["rows"].as_array().cloned().unwrap_or_default();
            Ok(json!({ "data": data, "pagination": { "page": page, "pageSize": page_size, "totalRows": data.len(), "totalPages": 1, "hasPreviousPage": page > 1, "hasNextPage": data.len() == page_size as usize }, "sorts": [], "filters": [], "_meta": { "statements": [{ "label": "Tablo verileri", "sql": sql }] } }))
        }
        "update-cell" => {
            if c.read_only { return Err("Bu bağlantı salt okunur modda.".into()); }
            let database = request.payload.get("database").and_then(Value::as_str).ok_or_else(|| "Veritabanı eksik.".to_string())?;
            let table = request.payload.get("table").and_then(Value::as_str).ok_or_else(|| "Tablo eksik.".to_string())?;
            let column = request.payload.get("column").and_then(Value::as_str).ok_or_else(|| "Kolon eksik.".to_string())?;
            let pk = request.payload.get("primaryKey").and_then(Value::as_object).ok_or_else(|| "Primary key eksik.".to_string())?;
            let value = request.payload.get("value").cloned().unwrap_or(Value::Null);
            let quote = if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") { "\"" } else { "`" };
            let literal = sql_literal(&value);
            let where_sql = pk.iter().map(|(k,v)| format!("{q}{k}{q}={v}", q=quote, k=k.replace(quote,""), v=sql_literal(v))).collect::<Vec<_>>().join(" AND ");
            let sql = format!("UPDATE {q}{db}{q}.{q}{table}{q} SET {q}{col}{q}={value} WHERE {where_sql}", q=quote, db=database.replace(quote,""), table=table.replace(quote,""), col=column.replace(quote,""), value=literal, where_sql=where_sql);
            let result = if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") { pg_query(&c,&sql,Some(database),1).await? } else { mysql_query(&c,&sql,Some(database),1).await? };
            Ok(json!({ "affectedRows": result["affectedRows"], "value": value, "_meta": { "statements":[{"label":"Hücre güncelleme","sql":sql}] } }))
        }
        "delete-rows" => {
            if c.read_only { return Err("Bu bağlantı salt okunur modda.".into()); }
            let database = request.payload.get("database").and_then(Value::as_str).ok_or_else(|| "Veritabanı eksik.".to_string())?;
            let table = request.payload.get("table").and_then(Value::as_str).ok_or_else(|| "Tablo eksik.".to_string())?;
            let keys = request.payload.get("primaryKeys").and_then(Value::as_array).ok_or_else(|| "Primary key listesi eksik.".to_string())?;
            let quote = if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") { "\"" } else { "`" };
            let clauses = keys.iter().filter_map(Value::as_object).map(|pk| format!("({})", pk.iter().map(|(k,v)| format!("{q}{k}{q}={v}",q=quote,k=k.replace(quote,""),v=sql_literal(v))).collect::<Vec<_>>().join(" AND "))).collect::<Vec<_>>();
            if clauses.is_empty() { return Err("Silinecek satır bulunamadı.".into()); }
            let sql=format!("DELETE FROM {q}{db}{q}.{q}{table}{q} WHERE {}",clauses.join(" OR "),q=quote,db=database.replace(quote,""),table=table.replace(quote,""));
            let result=if matches!(c.engine.as_str(),"postgresql"|"cockroachdb"){pg_query(&c,&sql,Some(database),1).await?}else{mysql_query(&c,&sql,Some(database),1).await?};
            Ok(json!({"affectedRows":result["affectedRows"],"_meta":{"statements":[{"label":"Satır silme","sql":sql}]}}))
        }
        "export-data" => {
            let input=request.payload.get("exportInput").and_then(Value::as_object).ok_or_else(||"Export bilgisi eksik.".to_string())?;
            let database=input.get("database").and_then(Value::as_str).ok_or_else(||"Veritabanı eksik.".to_string())?;
            let table=input.get("table").and_then(Value::as_str).ok_or_else(||"Tablo eksik.".to_string())?;
            let limit=input.get("limit").and_then(Value::as_u64).unwrap_or(config.max_result_rows as u64).min(config.max_result_rows as u64);
            let offset=input.get("offset").and_then(Value::as_u64).unwrap_or(0);
            let quote=if matches!(c.engine.as_str(),"postgresql"|"cockroachdb"){"\""}else{"`"};
            let sql=format!("SELECT * FROM {q}{db}{q}.{q}{table}{q} LIMIT {limit} OFFSET {offset}",q=quote,db=database.replace(quote,""),table=table.replace(quote,""),limit=limit,offset=offset);
            let result=if matches!(c.engine.as_str(),"postgresql"|"cockroachdb"){pg_query(&c,&sql,Some(database),limit as usize).await?}else{mysql_query(&c,&sql,Some(database),limit as usize).await?};
            let rows=result["rows"].as_array().cloned().unwrap_or_default();
            let columns=rows.first().and_then(Value::as_object).map(|o|o.keys().cloned().collect::<Vec<_>>()).unwrap_or_default();
            let row_count = rows.len();
            Ok(json!({"rows":rows,"columns":columns,"rowCount":row_count}))
        }
        "table-info" => {
            let database = request.payload.get("database").and_then(Value::as_str).ok_or_else(|| "Veritabanı eksik.".to_string())?;
            let table = request.payload.get("table").and_then(Value::as_str).ok_or_else(|| "Tablo eksik.".to_string())?;
            if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") {
                let sql = format!("SELECT column_name AS \"Field\", data_type AS \"Type\", is_nullable AS \"Null\", column_default AS \"Default\", ordinal_position AS \"Ordinal_position\" FROM information_schema.columns WHERE table_schema='public' AND table_name='{}' ORDER BY ordinal_position", table.replace('\\'', "''"));
                let result = pg_query(&c, &sql, Some(database), config.max_result_rows).await?;
                Ok(json!({ "table": { "name": table, "comment": "", "engine": c.engine, "collation": null, "charset": null, "autoIncrement": null, "rowFormat": null, "tableType": "BASE TABLE", "createTime": null, "updateTime": null }, "columns": result["rows"], "indexes": [], "foreignKeys": [], "checkConstraints": [], "partitions": [], "createSQL": "", "_meta": { "statements": [{ "label": "Tablo yapısı", "sql": sql }] } }))
            } else {
                let sql = format!("SELECT COLUMN_NAME AS Field, COLUMN_TYPE AS Type, IS_NULLABLE AS `Null`, COLUMN_KEY AS `Key`, COLUMN_DEFAULT AS `Default`, EXTRA AS Extra, COLUMN_COMMENT AS Comment, COLLATION_NAME AS Collation, ORDINAL_POSITION AS Ordinal_position, DATA_TYPE AS Data_type, CHARACTER_MAXIMUM_LENGTH AS Character_maximum_length, NUMERIC_PRECISION AS Numeric_precision, NUMERIC_SCALE AS Numeric_scale, DATETIME_PRECISION AS Datetime_precision, CHARACTER_SET_NAME AS Character_set_name, GENERATION_EXPRESSION AS Generation_expression FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='{}' AND TABLE_NAME='{}' ORDER BY ORDINAL_POSITION", database.replace('\\'', "''"), table.replace('\\'', "''"));
                let result = mysql_query(&c, &sql, Some(database), config.max_result_rows).await?;
                Ok(json!({ "table": { "name": table, "comment": "", "engine": c.engine, "collation": null, "charset": null, "autoIncrement": null, "rowFormat": null, "tableType": "BASE TABLE", "createTime": null, "updateTime": null }, "columns": result["rows"], "indexes": [], "foreignKeys": [], "checkConstraints": [], "partitions": [], "createSQL": "", "_meta": { "statements": [{ "label": "Tablo yapısı", "sql": sql }] } }))
            }
        }
        "process-list" => {
            if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") {
                let sql = "SELECT pid AS id, usename AS user, client_addr::text AS host, datname AS database, state AS command, EXTRACT(EPOCH FROM (now()-query_start))::bigint AS seconds, wait_event AS state, query AS info FROM pg_stat_activity ORDER BY query_start NULLS LAST";
                let result = pg_query(&c, sql, database, config.max_result_rows).await?;
                Ok(json!({ "processes": result["rows"], "locks": [], "deadlockText": null, "currentConnectionId": null }))
            } else {
                let sql = "SELECT ID AS id, USER AS user, HOST AS host, DB AS database, COMMAND AS command, TIME AS seconds, STATE AS state, INFO AS info FROM information_schema.PROCESSLIST ORDER BY TIME DESC";
                let result = mysql_query(&c, sql, database, config.max_result_rows).await?;
                Ok(json!({ "processes": result["rows"], "locks": [], "deadlockText": null, "currentConnectionId": null }))
            }
        }
        "process-kill" => {
            let id = request.payload.get("processId").and_then(Value::as_u64).ok_or_else(|| "Process ID eksik.".to_string())?;
            let sql = if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") { format!("SELECT pg_terminate_backend({})", id) } else { format!("KILL {}", id) };
            if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") { pg_query(&c, &sql, database, 1).await?; } else { mysql_query(&c, &sql, database, 1).await?; }
            Ok(json!({ "killed": true, "processId": id }))
        }
        "users-list" => {
            if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") {
                let sql = "SELECT rolname AS user, '' AS host, NULL AS plugin, false AS \"accountLocked\", false AS \"passwordExpired\", NULL AS \"passwordLastChanged\", false AS \"isRole\" FROM pg_roles ORDER BY rolname";
                let result = pg_query(&c, sql, database, config.max_result_rows).await?;
                Ok(json!({ "users": result["rows"], "roles": [], "assignments": [] }))
            } else {
                let sql = "SELECT User AS user, Host AS host, plugin, IF(account_locked='Y',1,0) AS accountLocked, IF(password_expired='Y',1,0) AS passwordExpired, password_last_changed AS passwordLastChanged, 0 AS isRole FROM mysql.user ORDER BY User, Host";
                let result = mysql_query(&c, sql, database, config.max_result_rows).await?;
                Ok(json!({ "users": result["rows"], "roles": [], "assignments": [] }))
            }
        }
        "performance-snapshot" => {
            let sampled = chrono::Utc::now().to_rfc3339();
            Ok(json!({ "sampledAt": sampled, "uptimeSeconds": 0, "questions": 0, "threadsConnected": 0, "threadsRunning": 0, "maxUsedConnections": 0, "maxConnections": null, "slowQueries": 0, "abortedConnects": 0, "bytesReceived": 0, "bytesSent": 0, "bufferPool": { "totalPages":0,"freePages":0,"dataPages":0,"dirtyPages":0,"pageSize":0,"usagePercent":0,"dirtyPercent":0,"hitRatio":null,"reads":0,"readRequests":0 }, "replication": { "available":false,"running":null,"secondsBehind":null,"ioRunning":null,"sqlRunning":null,"sourceHost":null,"channelName":null,"lastError":null }, "storage": { "dataBytes":0,"indexBytes":0,"freeBytes":0,"totalBytes":0,"selectedDatabaseBytes":null,"topSchemas":[] } }))
        }
        "query" => {
            let sql = sql.ok_or_else(|| "SQL sorgusu eksik.".to_string())?;
            if c.read_only {
                let normalized = sql.trim_start().to_ascii_lowercase();
                if !(normalized.starts_with("select") || normalized.starts_with("show") || normalized.starts_with("describe") || normalized.starts_with("explain") || normalized.starts_with("with")) {
                    return Err("Bu bağlantı salt okunur modda.".into());
                }
            }
            if matches!(c.engine.as_str(), "postgresql" | "cockroachdb") { pg_query(&c, sql, database, config.max_result_rows).await } else { mysql_query(&c, sql, database, config.max_result_rows).await }
        }
        _ => Err(format!("Desktop bridge action henüz uygulanmadı: {}", request.action))
    }
}

#[tauri::command]
async fn database_request(app: tauri::AppHandle, request: DatabaseRequest) -> Result<Value, String> {
    let config = read_config(app)?;
    let timeout_ms = config.query_timeout_ms;
    tokio::time::timeout(Duration::from_millis(timeout_ms), execute_action(request, config)).await.map_err(|_| format!("Sorgu {} ms zaman aşımına uğradı.", timeout_ms))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![config_path, read_config, write_config, database_request])
        .run(tauri::generate_context!())
        .expect("Coreor Database başlatılamadı");
}
