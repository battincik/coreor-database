//! All database and persistence commands take a shared lease. Installation takes
//! the exclusive lease before checking transactions and holds it through restart.
use std::{sync::{Arc, Mutex}, time::Duration};
use base64::Engine;
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

fn validate_update_metadata(version: &str, url: &str, signature: &str) -> Result<(), &'static str> {
    let release_url = format!("https://github.com/battincik/coreor-database/releases/download/v{version}/");
    if !url.starts_with(&release_url) {
        return Err("UPDATE_MANIFEST_URL_MISMATCH");
    }
    // The .sig artifact is base64-encoded minisign text. A SHA-256 digest
    // may look plausible in the manifest but cannot authenticate a bundle.
    let valid_signature = base64::engine::general_purpose::STANDARD
        .decode(signature.trim())
        .is_ok_and(|bytes| bytes.starts_with(b"untrusted comment:"));
    if !valid_signature {
        return Err("UPDATE_MANIFEST_INVALID_SIGNATURE");
    }
    Ok(())
}

fn validate_update(update: &Update) -> Result<(), &'static str> {
    validate_update_metadata(&update.version, update.download_url.as_str(), &update.signature)
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
    *state.pending.lock().map_err(|_| "UPDATE_STATE_ERROR")? = None;
    let update = app.updater_builder()
        .pubkey(option_env!("COREOR_UPDATER_PUBLIC_KEY").unwrap_or_default())
        .timeout(Duration::from_secs(10))
        .build().map_err(|error| {
            crate::error_reporting::record_native_failure(&app, "update-install", "configuration", &error.to_string());
            "UPDATE_CONFIGURATION_ERROR"
        })?
        .check().await.map_err(|error| {
            crate::error_reporting::record_native_failure(&app, "update-install", "check", &error.to_string());
            "UPDATE_CHECK_FAILED"
        })?;
    if let Some(ref available) = update {
        validate_update(available).map_err(|code| {
            crate::error_reporting::record_native_failure(
                &app, "update-install", "manifest",
                &format!("{code}: version={}, target={}, url={}", available.version, available.target, available.download_url),
            );
            code.to_string()
        })?;
    }
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
    let mut update = state.pending.lock().map_err(|_| "UPDATE_STATE_ERROR")?.clone()
        .ok_or("UPDATE_NOT_AVAILABLE")?;
    validate_update(&update).map_err(str::to_string)?;
    update.timeout = Some(Duration::from_secs(15 * 60));
    let mut downloaded: u64 = 0;
    let bytes = update.download(
        |length, total| {
            downloaded += length as u64;
            let _ = app.emit("coreor:update-progress", serde_json::json!({"downloaded": downloaded, "total": total}));
        },
        || { let _ = app.emit("coreor:update-installing", ()); },
    ).await.map_err(|error| {
        crate::error_reporting::record_native_failure(&app, "update-install", "download-or-signature", &error.to_string());
        "UPDATE_DOWNLOAD_FAILED"
    })?;
    // On Windows install() launches the installer and exits the process on success.
    // On macOS/Linux it returns and the application needs an explicit restart.
    update.install(&bytes).map_err(|error| {
        crate::error_reporting::record_native_failure(&app, "update-install", "installer", &error.to_string());
        "UPDATE_INSTALL_FAILED"
    })?;
    #[cfg(not(windows))]
    app.restart();
    #[cfg(windows)]
    Ok(())
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
    #[test]
    fn rejects_the_broken_release_manifest() {
        let url = "https://github.com/battincik/coreor-database/releases/download/v26.9.2/Coreor.Database_26.9.2_x64-setup.exe";
        let hash = "a1a91fff4c4c6a2cd1dfe858c6102c90cf54e51347de5eea037a790363bdd4b2";
        assert_eq!(validate_update_metadata("26.9.3", url, hash), Err("UPDATE_MANIFEST_URL_MISMATCH"));
        let correct_url = "https://github.com/battincik/coreor-database/releases/download/v26.9.3/Coreor.Database_26.9.3_x64-setup.exe";
        assert_eq!(validate_update_metadata("26.9.3", correct_url, hash), Err("UPDATE_MANIFEST_INVALID_SIGNATURE"));
        let signature = base64::engine::general_purpose::STANDARD.encode("untrusted comment: signature\nexample");
        assert!(validate_update_metadata("26.9.3", correct_url, &signature).is_ok());
    }
}
