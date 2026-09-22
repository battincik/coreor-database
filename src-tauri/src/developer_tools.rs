use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{App, AppHandle, Manager, Runtime};

static DEVELOPER_TOOLS_ALLOWED: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
fn configure_windows_devtools<R: Runtime>(window: &tauri::WebviewWindow<R>, enabled: bool) -> Result<(), String> {
    window
        .with_webview(move |webview| unsafe {
            if let Ok(core) = webview.controller().CoreWebView2() {
                if let Ok(settings) = core.Settings() {
                    let _ = settings.SetAreDevToolsEnabled(enabled);
                }
            }
        })
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "windows"))]
fn configure_windows_devtools<R: Runtime>(_window: &tauri::WebviewWindow<R>, _enabled: bool) -> Result<(), String> {
    Ok(())
}

pub fn initialize<R: Runtime>(app: &App<R>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Ana uygulama penceresi bulunamadı.".to_string())?;

    // Always start denied. React must explicitly re-enable the persisted preference,
    // and the native command gate remains authoritative for direct IPC calls.
    DEVELOPER_TOOLS_ALLOWED.store(false, Ordering::SeqCst);
    configure_windows_devtools(&window, false)
}

#[tauri::command]
pub fn set_developer_tools_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Ana uygulama penceresi bulunamadı.".to_string())?;

    configure_windows_devtools(&window, enabled)?;
    DEVELOPER_TOOLS_ALLOWED.store(enabled, Ordering::SeqCst);

    #[cfg(not(target_os = "windows"))]
    if !enabled {
        window.close_devtools();
    }

    Ok(())
}

#[tauri::command]
pub fn open_developer_tools(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Ana uygulama penceresi bulunamadı.".to_string())?;

    if !DEVELOPER_TOOLS_ALLOWED.load(Ordering::SeqCst) {
        return Err("Geliştirici araçları Ayarlar > Gelişmiş bölümünden açıkça etkinleştirilmelidir.".to_string());
    }

    window.open_devtools();
    Ok(())
}
