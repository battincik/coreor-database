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
