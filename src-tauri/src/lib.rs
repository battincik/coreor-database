mod app_updates;
mod error_reporting;
mod database;
mod developer_tools;
mod secure_vault;
mod transactions;
mod window_state;

use database::DatabaseRequest;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, fs::OpenOptions, io::Write, path::PathBuf, sync::{Mutex, OnceLock}, time::Duration};
use tauri::{Manager, State};
use transactions::TransactionStore;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultPreferences {
    #[serde(default = "local_vault_version")]
    local_vault_version: u32,
    #[serde(default = "local_vault_provider")]
    local_provider: String,
    #[serde(default = "cloud_envelope_version")]
    cloud_envelope_version: u32,
    #[serde(default)]
    cloud_sync_enabled: bool,
    #[serde(default = "default_remember_cloud_key")]
    remember_cloud_key_on_device: bool,
}

impl Default for VaultPreferences {
    fn default() -> Self {
        Self {
            local_vault_version: local_vault_version(),
            local_provider: local_vault_provider(),
            cloud_envelope_version: cloud_envelope_version(),
            cloud_sync_enabled: false,
            remember_cloud_key_on_device: default_remember_cloud_key(),
        }
    }
}

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
    vault: VaultPreferences,
    #[serde(default)]
    connections: Vec<Value>,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            version: config_version(),
            query_timeout_ms: default_query_timeout(),
            max_result_rows: default_max_rows(),
            max_page_size: default_page_size(),
            vault: VaultPreferences::default(),
            connections: Vec::new(),
        }
    }
}

fn config_version() -> u32 { 2 }
fn local_vault_version() -> u32 { 1 }
fn local_vault_provider() -> String { "os-secured-aes256gcm".into() }
fn cloud_envelope_version() -> u32 { 1 }
fn default_remember_cloud_key() -> bool { true }
fn default_query_timeout() -> u64 { 120_000 }
fn default_max_rows() -> usize { 50_000 }
fn default_page_size() -> usize { 10_000 }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformInfo {
    os: String,
    arch: String,
    family: String,
    app_version: String,
    config_dir: String,
    data_dir: String,
    cache_dir: String,
    log_dir: String,
}

#[tauri::command]
fn platform_info(app: tauri::AppHandle) -> Result<PlatformInfo, String> {
    let _work = app_updates::work_lease(&app)?;
    let path = app.path();
    Ok(PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
        app_version: app.package_info().version.to_string(),
        config_dir: path.app_config_dir().map_err(|e| e.to_string())?.to_string_lossy().into_owned(),
        data_dir: path.app_data_dir().map_err(|e| e.to_string())?.to_string_lossy().into_owned(),
        cache_dir: path.app_cache_dir().map_err(|e| e.to_string())?.to_string_lossy().into_owned(),
        log_dir: path.app_log_dir().map_err(|e| e.to_string())?.to_string_lossy().into_owned(),
    })
}

fn config_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

fn write_config_file(app: &tauri::AppHandle, config: &DesktopConfig) -> Result<(), String> {
    let path = config_file(app)?;
    let tmp = path.with_extension("json.tmp");
    let mut persisted = config.clone();
    persisted.version = config_version();
    persisted.connections.clear();

    fs::write(&tmp, serde_json::to_vec_pretty(&persisted).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    fs::rename(tmp, path).map_err(|e| e.to_string())
}

fn read_config_settings(app: &tauri::AppHandle) -> Result<DesktopConfig, String> {
    let path = config_file(app)?;
    if !path.exists() {
        let config = DesktopConfig::default();
        write_config_file(app, &config)?;
        return Ok(config);
    }

    let mut config: DesktopConfig =
        serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;

    if !config.connections.is_empty() {
        secure_vault::migrate_legacy_connections(app, config.connections.clone())?;
        config.connections.clear();
        config.version = config_version();
        config.vault = VaultPreferences::default();
        write_config_file(app, &config)?;
    } else if config.version != config_version() {
        config.version = config_version();
        write_config_file(app, &config)?;
    }

    Ok(config)
}

fn ensure_secure_config(app: &tauri::AppHandle) -> Result<(), String> {
    read_config_settings(app).map(|_| ())
}

#[tauri::command]
fn config_path(app: tauri::AppHandle) -> Result<String, String> {
    let _work = app_updates::work_lease(&app)?;
    Ok(config_file(&app)?.to_string_lossy().into_owned())
}

static SQL_LOG_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn sql_log_io_lock() -> &'static Mutex<()> {
    SQL_LOG_IO_LOCK.get_or_init(|| Mutex::new(()))
}

fn sql_log_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("sql.log"))
}

fn rotate_sql_log_if_needed(path: &PathBuf) -> Result<(), String> {
    const MAX_SQL_LOG_BYTES: u64 = 25 * 1024 * 1024;
    if !path.exists() || fs::metadata(path).map_err(|e| e.to_string())?.len() < MAX_SQL_LOG_BYTES {
        return Ok(());
    }
    let rotated = path.with_extension("log.1");
    if rotated.exists() {
        fs::remove_file(&rotated).map_err(|e| e.to_string())?;
    }
    fs::rename(path, rotated).map_err(|e| e.to_string())
}

#[tauri::command]
fn sql_log_path(app: tauri::AppHandle) -> Result<String, String> {
    let _work = app_updates::work_lease(&app)?;
    Ok(sql_log_file(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
fn append_sql_log(app: tauri::AppHandle, line: String) -> Result<(), String> {
    let _work = app_updates::work_lease(&app)?;
    if line.len() > 200_000 {
        return Err("SQL günlük kaydı izin verilen boyutu aşıyor.".into());
    }
    let _guard = sql_log_io_lock().lock().map_err(|_| "SQL günlük I/O kilidi kullanılamıyor.".to_string())?;
    let path = sql_log_file(&app)?;
    rotate_sql_log_if_needed(&path)?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    file.write_all(b"\n").map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())
}

#[tauri::command]
fn read_config(app: tauri::AppHandle) -> Result<DesktopConfig, String> {
    let _work = app_updates::work_lease(&app)?;
    let mut config = read_config_settings(&app)?;
    config.connections = secure_vault::read_connections_for_ui(&app)?;
    Ok(config)
}

#[tauri::command]
fn write_config(app: tauri::AppHandle, mut config: DesktopConfig) -> Result<(), String> {
    let _work = app_updates::work_lease(&app)?;
    secure_vault::write_connections(&app, std::mem::take(&mut config.connections))?;
    config.version = config_version();
    write_config_file(&app, &config)
}

#[tauri::command]
fn vault_status(app: tauri::AppHandle) -> Result<secure_vault::VaultStatus, String> {
    let _work = app_updates::work_lease(&app)?;
    secure_vault::status(&app)
}

#[tauri::command]
fn cloud_vault_readiness() -> Value {
    secure_vault::cloud_readiness_metadata()
}


#[tauri::command]
fn workspace_read(app: tauri::AppHandle, collection: String, scope: String) -> Result<Vec<Value>, String> {
    let _work = app_updates::work_lease(&app)?;
    secure_vault::workspace_read(&app, &collection, &scope)
}
#[tauri::command]
fn workspace_write(app: tauri::AppHandle, collection: String, scope: String, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let _work = app_updates::work_lease(&app)?;
    secure_vault::workspace_write(&app, &collection, &scope, items)
}
#[tauri::command]
fn workspace_import_legacy(app: tauri::AppHandle, collection: String, scope: String, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let _work = app_updates::work_lease(&app)?;
    secure_vault::workspace_import_legacy(&app, &collection, &scope, items)
}
#[tauri::command]
fn workspace_sync_manifest(app: tauri::AppHandle) -> Result<Value, String> {
    let _work = app_updates::work_lease(&app)?;
    secure_vault::workspace_sync_manifest(&app)
}


#[tauri::command]
fn workspace_sync_export(app: tauri::AppHandle) -> Result<Value, String> {
    let _work = app_updates::work_lease(&app)?;
    secure_vault::workspace_sync_export(&app)
}

#[tauri::command]
fn workspace_sync_merge(app: tauri::AppHandle, remote: Value) -> Result<Value, String> {
    let _work = app_updates::work_lease(&app)?;
    secure_vault::workspace_sync_merge(&app, remote)
}

#[tauri::command]
async fn database_request(
    app: tauri::AppHandle,
    state: State<'_, TransactionStore>,
    mut request: DatabaseRequest,
) -> Result<Value, String> {
    let _work = app_updates::work_lease(&app)?;
    let config = read_config_settings(&app)?;

    if let Some(connection) = request.connection.as_mut() {
        if connection.password.is_empty() {
            let server_id = connection.server_id.as_deref().ok_or_else(|| {
                "Bağlantı parolası sağlanmadı ve güvenli kasa sunucu kimliği yok.".to_string()
            })?;
            connection.password = secure_vault::password_for_server(&app, server_id)?;
        }
    }

    if transactions::is_transaction_action(&request.action) {
        let transaction_id = request.payload.get("transactionId")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);

        match tokio::time::timeout(
            Duration::from_millis(config.query_timeout_ms),
            transactions::handle(request, &state, config.max_result_rows),
        ).await {
            Ok(result) => return result,
            Err(_) => {
                if let Some(id) = transaction_id {
                    transactions::discard(&state, &id).await;
                }
                return Err("Transaction işlemi zaman aşımına uğradı; güvenlik için transaction oturumu kapatıldı.".into());
            }
        }
    }

    let max_page_size = config.max_page_size.max(10_000);
    tokio::time::timeout(
        Duration::from_millis(config.query_timeout_ms),
        database::execute_action(request, config.max_result_rows, max_page_size),
    )
    .await
    .map_err(|_| "Veritabanı işlemi zaman aşımına uğradı.".to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TransactionStore::default())
        .manage(app_updates::UpdateState::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<app_updates::UpdateState>().gate.try_read().is_err() { api.prevent_close(); }
            }
        })
        .setup(|app| {
            error_reporting::initialize(app.handle()).map_err(std::io::Error::other)?;
            ensure_secure_config(app.handle()).map_err(|error| { error_reporting::record_native(app.handle(), "startup"); std::io::Error::other(error) })?;
            window_state::restore_and_track(app).map_err(std::io::Error::other)?;
            developer_tools::initialize(app).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_updates::updater_status,
            app_updates::update_window_snapshot,
            app_updates::check_app_update,
            app_updates::install_app_update,
            error_reporting::report_app_error,
            error_reporting::error_log_path,
            error_reporting::read_diagnostic_settings,
            error_reporting::set_error_reporting,
            platform_info,
            config_path,
            sql_log_path,
            append_sql_log,
            read_config,
            write_config,
            vault_status,
            cloud_vault_readiness,
            developer_tools::set_developer_tools_enabled,
            developer_tools::open_developer_tools,
            workspace_read,
            workspace_write,
            workspace_import_legacy,
            workspace_sync_manifest,
            workspace_sync_export,
            workspace_sync_merge,
            database_request
        ])
        .run(tauri::generate_context!())
        .expect("Coreor Database başlatılamadı");
}
