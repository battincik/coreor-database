//! Deliberately excludes arbitrary messages, SQL, request arguments, results and
//! full stack strings. Only schema-defined diagnostic metadata leaves the app.
use std::{collections::VecDeque, fs, fs::OpenOptions, io::Write, path::PathBuf, sync::{Mutex, OnceLock}, time::{Duration, Instant}};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
const ENDPOINT: &str = "https://api.coreor.net/app/database/error-report";
static IO: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSettings { pub remote_enabled: bool }
impl Default for DiagnosticSettings { fn default() -> Self { Self { remote_enabled: true } } }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorInput { pub source: String, pub kind: String, #[serde(default)] pub frames: Vec<Frame> }
#[derive(Clone, Serialize, Deserialize)]
pub struct Frame { pub file: String, pub line: u32, pub column: u32 }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Report { schema_version: u8, event_id: String, timestamp: String, app_version: String, os: &'static str, arch: &'static str, source: String, kind: String, frames: Vec<Frame> }
pub struct Reporter {
    settings: Mutex<DiagnosticSettings>,
    queue: Mutex<VecDeque<(Report, u8)>>,
    rate: Mutex<(Instant, usize)>,
    sending: tokio::sync::Mutex<()>,
}
fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|_| "DIAGNOSTICS_PATH_ERROR")?;
    fs::create_dir_all(&dir).map_err(|_| "DIAGNOSTICS_IO_ERROR")?;
    Ok(dir.join("diagnostics.json"))
}
fn log_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_log_dir().map_err(|_| "DIAGNOSTICS_PATH_ERROR")?;
    fs::create_dir_all(&dir).map_err(|_| "DIAGNOSTICS_IO_ERROR")?;
    Ok(dir.join("error.log"))
}
fn append(app: &AppHandle, report: &Report) -> Result<(), String> {
    let _guard = IO.get_or_init(|| Mutex::new(())).lock().map_err(|_| "DIAGNOSTICS_LOCK_ERROR")?;
    let path = log_path(app)?;
    if fs::metadata(&path).is_ok_and(|m| m.len() >= 5 * 1024 * 1024) {
        let old = path.with_extension("log.1");
        if old.exists() { fs::remove_file(&old).map_err(|_| "DIAGNOSTICS_IO_ERROR")?; }
        fs::rename(&path, old).map_err(|_| "DIAGNOSTICS_IO_ERROR")?;
    }
    let mut file = OpenOptions::new().create(true).append(true).open(path).map_err(|_| "DIAGNOSTICS_IO_ERROR")?;
    serde_json::to_writer(&mut file, report).map_err(|_| "DIAGNOSTICS_IO_ERROR")?;
    file.write_all(b"\n").map_err(|_| "DIAGNOSTICS_IO_ERROR")?;
    file.flush().map_err(|_| "DIAGNOSTICS_IO_ERROR".into())
}
fn record(app: &AppHandle, input: ErrorInput) -> Result<(), String> {
    let sources = ["window", "promise", "react", "native-command", "native-panic", "update-install", "startup"];
    let kinds = ["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "URIError", "EvalError", "NativeError"];
    if !sources.contains(&input.source.as_str()) || !kinds.contains(&input.kind.as_str()) { return Err("DIAGNOSTICS_INVALID_EVENT".into()); }
    let state = app.state::<Reporter>();
    let mut rate = state.rate.lock().map_err(|_| "DIAGNOSTICS_LOCK_ERROR")?;
    if rate.0.elapsed() >= Duration::from_secs(60) { *rate = (Instant::now(), 0); }
    if rate.1 >= 60 { return Ok(()); }
    rate.1 += 1;
    drop(rate);
    let frames = input.frames.into_iter().take(16).filter(|f| {
        // Accept only bundled JS asset names, never URLs or user paths.
        f.file.len() <= 96 && f.file.ends_with(".js") && f.file.bytes().all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
    }).collect();
    let report = Report { schema_version: 1, event_id: uuid::Uuid::new_v4().to_string(), timestamp: chrono::Utc::now().to_rfc3339(), app_version: app.package_info().version.to_string(), os: std::env::consts::OS, arch: std::env::consts::ARCH, source: input.source, kind: input.kind, frames };
    append(app, &report)?;
    if !cfg!(debug_assertions) {
        let settings = state.settings.lock().map_err(|_| "DIAGNOSTICS_LOCK_ERROR")?;
        if settings.remote_enabled {
            let mut queue = state.queue.lock().map_err(|_| "DIAGNOSTICS_LOCK_ERROR")?;
            if queue.len() == 100 { queue.pop_front(); }
            queue.push_back((report, 0));
        }
    }
    Ok(())
}
pub fn record_native(app: &AppHandle, source: &str) {
    let _ = record(app, ErrorInput { source: source.into(), kind: "NativeError".into(), frames: Vec::new() });
}
#[tauri::command]
pub fn report_app_error(app: AppHandle, error: ErrorInput) -> Result<(), String> { record(&app, error) }
#[tauri::command]
pub fn error_log_path(app: AppHandle) -> Result<String, String> { Ok(log_path(&app)?.to_string_lossy().into_owned()) }
#[tauri::command]
pub fn read_diagnostic_settings(app: AppHandle) -> Result<DiagnosticSettings, String> {
    app.state::<Reporter>().settings.lock().map(|s| s.clone()).map_err(|_| "DIAGNOSTICS_LOCK_ERROR".into())
}
#[tauri::command]
pub async fn set_error_reporting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<Reporter>();
    // Wait for the bounded in-flight send. Once this command succeeds no old
    // queued report can be sent, including after a future re-enable.
    let _sending = state.sending.lock().await;
    let mut settings = state.settings.lock().map_err(|_| "DIAGNOSTICS_LOCK_ERROR")?;
    let next = DiagnosticSettings { remote_enabled: enabled };
    fs::write(settings_path(&app)?, serde_json::to_vec_pretty(&next).map_err(|_| "DIAGNOSTICS_IO_ERROR")?).map_err(|_| "DIAGNOSTICS_IO_ERROR")?;
    *settings = next;
    if !enabled { state.queue.lock().map_err(|_| "DIAGNOSTICS_LOCK_ERROR")?.clear(); }
    Ok(())
}
pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let path = settings_path(app)?;
    let settings = if path.exists() {
        // Fail closed if an existing preference cannot be decoded.
        fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or(DiagnosticSettings { remote_enabled: false })
    } else { DiagnosticSettings::default() };
    app.manage(Reporter { settings: Mutex::new(settings), queue: Mutex::new(VecDeque::new()), rate: Mutex::new((Instant::now(), 0)), sending: tokio::sync::Mutex::new(()) });
    let _ = OpenOptions::new().create(true).append(true).open(log_path(app)?);
    let handle = app.clone();
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| { record_native(&handle, "native-panic"); previous(info); }));
    if !cfg!(debug_assertions) {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let Ok(client) = reqwest::Client::builder().timeout(Duration::from_secs(8)).redirect(reqwest::redirect::Policy::none()).build() else { return; };
            loop {
                tokio::time::sleep(Duration::from_secs(15)).await;
                let state = handle.state::<Reporter>();
                let _sending = state.sending.lock().await;
                if !state.settings.lock().map(|s| s.remote_enabled).unwrap_or(false) { continue; }
                let item = state.queue.lock().ok().and_then(|mut q| q.pop_front());
                if let Some((report, attempts)) = item {
                    let response = client.post(ENDPOINT).json(&report).send().await;
                    let retry = match response { Ok(r) => r.status().is_server_error() || r.status().as_u16() == 429, Err(_) => true };
                    if retry && attempts < 2 {
                        if let Ok(mut q) = state.queue.lock() { if q.len() < 100 { q.push_back((report, attempts + 1)); } }
                    }
                }
            }
        });
    }
    Ok(())
}
