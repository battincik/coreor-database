use tauri::{App, AppHandle, Manager, Runtime};

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

    // Windows WebView2 otherwise lets F12 / browser shortcuts bypass a UI-only gate.
    // Start denied; the persisted app preference explicitly enables it after React hydrates.
    configure_windows_devtools(&window, false)
}

#[tauri::command]
pub fn set_developer_tools_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Ana uygulama penceresi bulunamadı.".to_string())?;

    configure_windows_devtools(&window, enabled)?;

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

    // On Windows this also ensures the WebView2 setting was enabled before opening.
    configure_windows_devtools(&window, true)?;
    window.open_devtools();
    Ok(())
}
