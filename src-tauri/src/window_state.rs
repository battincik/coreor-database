use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::{Arc, Mutex}};
use tauri::{App, AppHandle, LogicalSize, Manager, Runtime, WindowEvent};

const DEFAULT_WIDTH: f64 = 1440.0;
const DEFAULT_HEIGHT: f64 = 900.0;
const MIN_WIDTH: f64 = 900.0;
const MIN_HEIGHT: f64 = 600.0;
const MAX_WIDTH: f64 = 10_000.0;
const MAX_HEIGHT: f64 = 10_000.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWindowState {
    width: f64,
    height: f64,
    maximized: bool,
}

impl Default for PersistedWindowState {
    fn default() -> Self {
        Self { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, maximized: false }
    }
}

fn state_file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("window-state.json"))
}

fn normalize(mut state: PersistedWindowState) -> PersistedWindowState {
    state.width = if state.width.is_finite() { state.width.clamp(MIN_WIDTH, MAX_WIDTH) } else { DEFAULT_WIDTH };
    state.height = if state.height.is_finite() { state.height.clamp(MIN_HEIGHT, MAX_HEIGHT) } else { DEFAULT_HEIGHT };
    state
}

fn clamp_to_current_monitor<R: Runtime>(
    window: &tauri::WebviewWindow<R>,
    mut state: PersistedWindowState,
) -> PersistedWindowState {
    let monitor = window.current_monitor().ok().flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor().max(0.1);
        let work_area = monitor.work_area();
        // Leave a small logical margin so native resize borders/title hit targets
        // never land flush against the taskbar or desktop work-area boundary.
        let max_width = (work_area.size.width as f64 / scale - 32.0).max(MIN_WIDTH);
        let max_height = (work_area.size.height as f64 / scale - 32.0).max(MIN_HEIGHT);
        state.width = state.width.min(max_width);
        state.height = state.height.min(max_height);
    }

    normalize(state)
}

fn read_state<R: Runtime>(app: &AppHandle<R>) -> PersistedWindowState {
    let Ok(path) = state_file(app) else { return PersistedWindowState::default(); };
    let Ok(bytes) = fs::read(path) else { return PersistedWindowState::default(); };
    serde_json::from_slice::<PersistedWindowState>(&bytes).map(normalize).unwrap_or_default()
}

fn write_state<R: Runtime>(app: &AppHandle<R>, state: &PersistedWindowState) -> Result<(), String> {
    let path = state_file(app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(&normalize(state.clone())).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    fs::rename(tmp, path).map_err(|error| error.to_string())
}

pub fn restore_and_track<R: Runtime>(app: &App<R>) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or_else(|| "Ana uygulama penceresi bulunamadı.".to_string())?;
    let saved = clamp_to_current_monitor(&window, read_state(app.handle()));

    window.set_size(LogicalSize::new(saved.width, saved.height)).map_err(|error| error.to_string())?;
    if saved.maximized {
        window.maximize().map_err(|error| error.to_string())?;
    }
    window.show().map_err(|error| error.to_string())?;

    let state = Arc::new(Mutex::new(saved));
    let tracked_state = Arc::clone(&state);
    let tracked_window = window.clone();
    let app_handle = app.handle().clone();

    window.on_window_event(move |event| {
        match event {
            WindowEvent::Resized(size) => {
                let maximized = tracked_window.is_maximized().unwrap_or(false);
                let minimized = tracked_window.is_minimized().unwrap_or(false);
                if maximized || minimized { return; }
                let scale = tracked_window.scale_factor().unwrap_or(1.0).max(0.1);
                if let Ok(mut current) = tracked_state.lock() {
                    current.width = (size.width as f64 / scale).clamp(MIN_WIDTH, MAX_WIDTH);
                    current.height = (size.height as f64 / scale).clamp(MIN_HEIGHT, MAX_HEIGHT);
                    current.maximized = false;
                }
            }
            WindowEvent::CloseRequested { .. } => {
                if let Ok(mut current) = tracked_state.lock() {
                    current.maximized = tracked_window.is_maximized().unwrap_or(false);
                    let _ = write_state(&app_handle, &current);
                }
            }
            _ => {}
        }
    });

    Ok(())
}
