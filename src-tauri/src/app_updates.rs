//! All database and persistence commands take a shared lease. Installation takes
//! the exclusive lease before checking transactions and holds it through restart.
use std::{sync::{Arc, Mutex}, time::Duration};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::{OwnedRwLockReadGuard, RwLock};

#[derive(Default)]
pub struct UpdateState {
    pub gate: Arc<RwLock<()>>,
    pending: Mutex<Option<Update>>,
    checking: tokio::sync::Mutex<()>,
}

pub fn work_lease(app: &AppHandle) -> Result<OwnedRwLockReadGuard<()>, String> {
    app.state::<UpdateState>().gate.clone().try_read_owned()
        .map_err(|_| "UPDATE_IN_PROGRESS".into())
}

fn enabled() -> bool {
    !cfg!(debug_assertions) && option_env!("COREOR_UPDATER_PUBLIC_KEY").is_some_and(|key| !key.trim().is_empty())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    enabled: bool,
    development: bool,
    version: Option<String>,
}

#[tauri::command]
pub fn updater_status() -> UpdateStatus {
    UpdateStatus { enabled: enabled(), development: cfg!(debug_assertions), version: None }
}

#[tauri::command]
pub async fn check_app_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<UpdateStatus, String> {
    if !enabled() { return Ok(updater_status()); }
    let _check = state.checking.try_lock().map_err(|_| "UPDATE_CHECK_BUSY")?;
    let _lease = work_lease(&app)?;
    let update = app.updater_builder()
        .pubkey(option_env!("COREOR_UPDATER_PUBLIC_KEY").unwrap_or_default())
        .timeout(Duration::from_secs(10))
        .build().map_err(|_| "UPDATE_CONFIGURATION_ERROR")?
        .check().await.map_err(|_| "UPDATE_CHECK_FAILED")?;
    let version = update.as_ref().map(|u| u.version.clone());
    *state.pending.lock().map_err(|_| "UPDATE_STATE_ERROR")? = update;
    Ok(UpdateStatus { enabled: true, development: false, version })
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    if !enabled() { return Err("UPDATER_DISABLED".into()); }
    // Fail immediately; never queue an install behind a user's work.
    let _exclusive = state.gate.clone().try_write_owned().map_err(|_| "UPDATE_ACTIVE_WORK")?;
    if crate::transactions::has_open_transactions(&app.state::<crate::transactions::TransactionStore>()).await {
        return Err("UPDATE_OPEN_TRANSACTION".into());
    }
    let update = state.pending.lock().map_err(|_| "UPDATE_STATE_ERROR")?.clone()
        .ok_or("UPDATE_NOT_AVAILABLE")?;
    let mut downloaded: u64 = 0;
    let result = update.download_and_install(
        |length, total| {
            downloaded += length as u64;
            let _ = app.emit("coreor:update-progress", serde_json::json!({"downloaded": downloaded, "total": total}));
        },
        || { let _ = app.emit("coreor:update-installing", ()); },
    ).await;
    if result.is_err() {
        crate::error_reporting::record_native(&app, "update-install");
        return Err("UPDATE_INSTALL_FAILED".into());
    }
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installation_and_work_cannot_overlap() {
        let gate = Arc::new(RwLock::new(()));
        let first = gate.clone().try_read_owned().unwrap();
        let second = gate.clone().try_read_owned().unwrap();
        assert!(gate.clone().try_write_owned().is_err());
        drop(first);
        assert!(gate.clone().try_write_owned().is_err());
        drop(second);
        let install = gate.clone().try_write_owned().unwrap();
        assert!(gate.clone().try_read_owned().is_err());
        drop(install);
        assert!(gate.clone().try_read_owned().is_ok());
    }
    #[test]
    fn debug_build_disables_installation() { if cfg!(debug_assertions) { assert!(!enabled()); } }
}
