use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::Utc;
use ring::{
    aead::{self, Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM},
    rand::{SecureRandom, SystemRandom},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::{Mutex, OnceLock, RwLock},
};
use tauri::Manager;
use uuid::Uuid;

const VAULT_VERSION: u32 = 1;
const VAULT_FILE_NAME: &str = "connection-vault.v1.json";
const VAULT_ALGORITHM: &str = "AES-256-GCM";
const VAULT_AAD: &[u8] = b"net.coreor.database/local-vault/v1";
const DEVICE_KEY_BYTES: usize = 32;
const DEVICE_KEY_SERVICE: &str = "net.coreor.database.local-vault";
const DEVICE_KEY_ACCOUNT: &str = "device-key-v1";

static VAULT_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static DEVICE_KEY_CACHE: OnceLock<RwLock<Option<[u8; DEVICE_KEY_BYTES]>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultEnvelope {
    version: u32,
    algorithm: String,
    nonce: String,
    ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultPayload {
    version: u32,
    #[serde(default = "new_device_id")]
    device_id: String,
    #[serde(default)]
    connections: Vec<Value>,
    #[serde(default)]
    workspace: HashMap<String, WorkspaceCollection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceRecord {
    id: String,
    revision: u64,
    order: usize,
    updated_at: String,
    deleted_at: Option<String>,
    updated_by_device: String,
    payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCollection {
    #[serde(default = "workspace_schema_version")]
    schema_version: u32,
    #[serde(default)]
    records: Vec<WorkspaceRecord>,
}

impl Default for WorkspaceCollection {
    fn default() -> Self {
        Self { schema_version: workspace_schema_version(), records: Vec::new() }
    }
}

fn workspace_schema_version() -> u32 { 1 }
fn new_device_id() -> String { Uuid::new_v4().to_string() }

impl Default for VaultPayload {
    fn default() -> Self {
        Self {
            version: VAULT_VERSION,
            device_id: new_device_id(),
            connections: Vec::new(),
            workspace: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub encrypted: bool,
    pub local_vault_version: u32,
    pub algorithm: String,
    pub key_backend: String,
    pub key_available: bool,
    pub connection_count: usize,
    pub vault_path: String,
}

fn io_lock() -> &'static Mutex<()> {
    VAULT_IO_LOCK.get_or_init(|| Mutex::new(()))
}

fn key_cache() -> &'static RwLock<Option<[u8; DEVICE_KEY_BYTES]>> {
    DEVICE_KEY_CACHE.get_or_init(|| RwLock::new(None))
}

fn vault_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join(VAULT_FILE_NAME))
}

fn random_bytes<const N: usize>() -> Result<[u8; N], String> {
    let mut bytes = [0u8; N];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| "Güvenli rastgele veri üretilemedi.".to_string())?;
    Ok(bytes)
}

fn key_from_bytes(bytes: &[u8]) -> Result<[u8; DEVICE_KEY_BYTES], String> {
    bytes.try_into().map_err(|_| "Yerel kasa cihaz anahtarı geçersiz uzunlukta.".to_string())
}

fn cached_key() -> Result<Option<[u8; DEVICE_KEY_BYTES]>, String> {
    key_cache()
        .read()
        .map_err(|_| "Yerel kasa anahtar önbelleği kilitlendi.".to_string())
        .map(|guard| *guard)
}

fn set_cached_key(key: [u8; DEVICE_KEY_BYTES]) -> Result<(), String> {
    let mut guard = key_cache()
        .write()
        .map_err(|_| "Yerel kasa anahtar önbelleği kilitlendi.".to_string())?;
    *guard = Some(key);
    Ok(())
}

fn device_key(create_if_missing: bool) -> Result<[u8; DEVICE_KEY_BYTES], String> {
    if let Some(key) = cached_key()? {
        return Ok(key);
    }
    if let Some(bytes) = platform_secret::read()? {
        let key = key_from_bytes(&bytes)?;
        set_cached_key(key)?;
        return Ok(key);
    }
    if !create_if_missing {
        return Err("Şifreli yerel kasa bulundu ancak bu cihazın güvenli kasa anahtarı işletim sistemi deposunda bulunamadı. Kasa üzerine yazılmadı.".to_string());
    }

    let key = random_bytes::<DEVICE_KEY_BYTES>()?;
    platform_secret::write(&key)?;
    set_cached_key(key)?;
    Ok(key)
}

fn encrypt_payload(key: &[u8; DEVICE_KEY_BYTES], plaintext: &[u8]) -> Result<VaultEnvelope, String> {
    let unbound = UnboundKey::new(&AES_256_GCM, key)
        .map_err(|_| "Yerel kasa şifreleme anahtarı oluşturulamadı.".to_string())?;
    let key = LessSafeKey::new(unbound);
    let nonce_bytes = random_bytes::<{ aead::NONCE_LEN }>()?;
    let mut in_out = plaintext.to_vec();
    key.seal_in_place_append_tag(
        Nonce::assume_unique_for_key(nonce_bytes),
        Aad::from(VAULT_AAD),
        &mut in_out,
    )
    .map_err(|_| "Yerel kasa şifrelenemedi.".to_string())?;

    Ok(VaultEnvelope {
        version: VAULT_VERSION,
        algorithm: VAULT_ALGORITHM.to_string(),
        nonce: BASE64.encode(nonce_bytes),
        ciphertext: BASE64.encode(in_out),
    })
}

fn decrypt_payload(key: &[u8; DEVICE_KEY_BYTES], envelope: VaultEnvelope) -> Result<Vec<u8>, String> {
    if envelope.version != VAULT_VERSION || envelope.algorithm != VAULT_ALGORITHM {
        return Err("Desteklenmeyen yerel kasa biçimi.".to_string());
    }

    let nonce_vec = BASE64.decode(envelope.nonce)
        .map_err(|_| "Yerel kasa nonce değeri bozuk.".to_string())?;
    let nonce_bytes: [u8; aead::NONCE_LEN] = nonce_vec.try_into()
        .map_err(|_| "Yerel kasa nonce uzunluğu geçersiz.".to_string())?;
    let mut in_out = BASE64.decode(envelope.ciphertext)
        .map_err(|_| "Yerel kasa ciphertext değeri bozuk.".to_string())?;

    let unbound = UnboundKey::new(&AES_256_GCM, key)
        .map_err(|_| "Yerel kasa çözme anahtarı oluşturulamadı.".to_string())?;
    let key = LessSafeKey::new(unbound);
    let plaintext = key.open_in_place(
        Nonce::assume_unique_for_key(nonce_bytes),
        Aad::from(VAULT_AAD),
        &mut in_out,
    )
    .map_err(|_| "Yerel kasa doğrulanamadı veya bu cihaz anahtarıyla açılamadı.".to_string())?;

    Ok(plaintext.to_vec())
}

fn write_encrypted_file(path: &PathBuf, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, bytes).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600))
            .map_err(|error| error.to_string())?;
    }
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    fs::rename(tmp, path).map_err(|error| error.to_string())
}

fn load_payload_unlocked(app: &tauri::AppHandle) -> Result<VaultPayload, String> {
    let path = vault_file(app)?;
    if !path.exists() {
        return Ok(VaultPayload::default());
    }

    let envelope: VaultEnvelope = serde_json::from_slice(
        &fs::read(&path).map_err(|error| error.to_string())?,
    )
    .map_err(|_| "Şifreli yerel kasa dosyası okunamadı.".to_string())?;

    let key = device_key(false)?;
    let plaintext = decrypt_payload(&key, envelope)?;
    let payload: VaultPayload = serde_json::from_slice(&plaintext)
        .map_err(|_| "Yerel kasa içeriği çözüldü ancak veri biçimi geçersiz.".to_string())?;

    if payload.version != VAULT_VERSION {
        return Err("Desteklenmeyen yerel kasa veri sürümü.".to_string());
    }
    Ok(payload)
}

fn save_payload_unlocked(app: &tauri::AppHandle, payload: &VaultPayload) -> Result<(), String> {
    let path = vault_file(app)?;
    let key = device_key(!path.exists())?;
    let plaintext = serde_json::to_vec(payload).map_err(|error| error.to_string())?;
    let envelope = encrypt_payload(&key, &plaintext)?;
    let bytes = serde_json::to_vec_pretty(&envelope).map_err(|error| error.to_string())?;
    write_encrypted_file(&path, &bytes)
}

fn connection_id(value: &Value) -> Option<&str> {
    value.get("id").and_then(Value::as_str)
}

fn connection_password(value: &Value) -> Option<String> {
    value.get("password")
        .and_then(Value::as_str)
        .filter(|password| !password.is_empty())
        .map(ToOwned::to_owned)
}

fn prepare_for_storage(mut value: Value, previous_password: Option<&str>) -> Value {
    if let Some(object) = value.as_object_mut() {
        object.remove("credentialRef");
        object.remove("credentialState");
        let supplied_password = object.get("password")
            .and_then(Value::as_str)
            .filter(|password| !password.is_empty())
            .map(ToOwned::to_owned);

        match supplied_password.or_else(|| previous_password.map(ToOwned::to_owned)) {
            Some(password) => {
                object.insert("password".to_string(), Value::String(password));
            }
            None => {
                object.remove("password");
            }
        }
    }
    value
}

fn sanitize_for_ui(mut value: Value) -> Value {
    if let Some(object) = value.as_object_mut() {
        let has_password = object.get("password")
            .and_then(Value::as_str)
            .is_some_and(|password| !password.is_empty());
        object.remove("password");

        if let Some(id) = object.get("id").and_then(Value::as_str).map(ToOwned::to_owned) {
            object.insert("credentialRef".to_string(), Value::String(format!("local-vault:{id}")));
            object.insert(
                "credentialState".to_string(),
                Value::String(if has_password { "stored" } else { "missing" }.to_string()),
            );
        }
    }
    value
}

pub fn read_connections_for_ui(app: &tauri::AppHandle) -> Result<Vec<Value>, String> {
    let _guard = io_lock().lock()
        .map_err(|_| "Yerel kasa I/O kilidi kullanılamıyor.".to_string())?;
    Ok(load_payload_unlocked(app)?.connections.into_iter().map(sanitize_for_ui).collect())
}

pub fn write_connections(app: &tauri::AppHandle, incoming: Vec<Value>) -> Result<(), String> {
    let _guard = io_lock().lock()
        .map_err(|_| "Yerel kasa I/O kilidi kullanılamıyor.".to_string())?;
    let mut payload = load_payload_unlocked(app)?;
    let previous_passwords = payload.connections.iter().filter_map(|connection| {
        Some((connection_id(connection)?.to_string(), connection_password(connection)?))
    }).collect::<HashMap<_, _>>();

    payload.connections = incoming.into_iter().map(|connection| {
        let previous = connection_id(&connection)
            .and_then(|id| previous_passwords.get(id))
            .map(String::as_str);
        prepare_for_storage(connection, previous)
    }).collect();
    payload.version = VAULT_VERSION;

    save_payload_unlocked(app, &payload)
}

pub fn migrate_legacy_connections(app: &tauri::AppHandle, legacy_connections: Vec<Value>) -> Result<(), String> {
    if legacy_connections.is_empty() {
        return Ok(());
    }

    let _guard = io_lock().lock()
        .map_err(|_| "Yerel kasa I/O kilidi kullanılamıyor.".to_string())?;
    let mut payload = load_payload_unlocked(app)?;
    let existing_passwords = payload.connections.iter().filter_map(|connection| {
        Some((connection_id(connection)?.to_string(), connection_password(connection)?))
    }).collect::<HashMap<_, _>>();

    for legacy in legacy_connections {
        let id = connection_id(&legacy).map(ToOwned::to_owned);
        let previous = id.as_deref()
            .and_then(|value| existing_passwords.get(value))
            .map(String::as_str);
        let legacy = prepare_for_storage(legacy, previous);

        if let Some(id) = id {
            if let Some(index) = payload.connections.iter()
                .position(|connection| connection_id(connection) == Some(id.as_str())) {
                payload.connections[index] = legacy;
                continue;
            }
        }
        payload.connections.push(legacy);
    }

    payload.version = VAULT_VERSION;
    save_payload_unlocked(app, &payload)
}


const SYNCABLE_WORKSPACE_COLLECTIONS: &[&str] = &[
    "query-history", "query-favorites", "query-tabs", "sql-notebooks", "activity-log",
    "snippets", "schema-snapshots", "migration-drafts", "prepared-statements",
    "approval-requests",
];

fn workspace_namespace(collection: &str, scope: &str) -> Result<String, String> {
    if !SYNCABLE_WORKSPACE_COLLECTIONS.contains(&collection) {
        return Err("Desteklenmeyen workspace koleksiyonu.".to_string());
    }
    let scope = scope.trim();
    if scope.is_empty() || scope.len() > 160 || !scope.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | ':' | '.')) {
        return Err("Workspace scope geçersiz.".to_string());
    }
    Ok(format!("{collection}:{scope}"))
}

fn workspace_item_id(value: &Value) -> Result<String, String> {
    value.get("id").and_then(Value::as_str)
        .filter(|id| !id.trim().is_empty() && id.len() <= 200)
        .map(ToOwned::to_owned)
        .ok_or_else(|| "Workspace kaydında geçerli id alanı bulunmalıdır.".to_string())
}

fn active_workspace_values(collection: &WorkspaceCollection) -> Vec<Value> {
    let mut records = collection.records.iter().filter(|record| record.deleted_at.is_none()).cloned().collect::<Vec<_>>();
    records.sort_by_key(|record| record.order);
    records.into_iter().map(|record| record.payload).collect()
}

fn merge_workspace_items(payload: &mut VaultPayload, namespace: String, incoming: Vec<Value>, import_only: bool) -> Result<bool, String> {
    let device_id = payload.device_id.clone();
    let now = Utc::now().to_rfc3339();
    let collection = payload.workspace.entry(namespace).or_default();
    collection.schema_version = workspace_schema_version();
    let mut index_by_id = collection.records.iter().enumerate().map(|(i, r)| (r.id.clone(), i)).collect::<HashMap<_, _>>();
    let mut seen = HashSet::new();
    let mut changed = false;
    let append_order_start = collection.records.iter().filter(|r| r.deleted_at.is_none()).map(|r| r.order).max().map(|v| v + 1).unwrap_or(0);

    for (incoming_order, item) in incoming.into_iter().enumerate() {
        let id = workspace_item_id(&item)?;
        if !seen.insert(id.clone()) { continue; }
        if let Some(index) = index_by_id.get(&id).copied() {
            if import_only { continue; }
            let record = &mut collection.records[index];
            if record.payload != item || record.deleted_at.is_some() || record.order != incoming_order {
                record.payload = item;
                record.deleted_at = None;
                record.order = incoming_order;
                record.revision = record.revision.saturating_add(1).max(1);
                record.updated_at = now.clone();
                record.updated_by_device = device_id.clone();
                changed = true;
            }
        } else {
            let order = if import_only { append_order_start + incoming_order } else { incoming_order };
            collection.records.push(WorkspaceRecord {
                id: id.clone(), revision: 1, order, updated_at: now.clone(), deleted_at: None,
                updated_by_device: device_id.clone(), payload: item,
            });
            index_by_id.insert(id, collection.records.len() - 1);
            changed = true;
        }
    }

    if !import_only {
        for record in &mut collection.records {
            if record.deleted_at.is_none() && !seen.contains(&record.id) {
                record.revision = record.revision.saturating_add(1).max(1);
                record.updated_at = now.clone();
                record.updated_by_device = device_id.clone();
                record.deleted_at = Some(now.clone());
                record.payload = Value::Null;
                changed = true;
            }
        }
    }
    Ok(changed)
}

pub fn workspace_read(app: &tauri::AppHandle, collection: &str, scope: &str) -> Result<Vec<Value>, String> {
    let namespace = workspace_namespace(collection, scope)?;
    let _guard = io_lock().lock().map_err(|_| "Yerel kasa I/O kilidi kullanılamıyor.".to_string())?;
    let payload = load_payload_unlocked(app)?;
    Ok(payload.workspace.get(&namespace).map(active_workspace_values).unwrap_or_default())
}

pub fn workspace_write(app: &tauri::AppHandle, collection: &str, scope: &str, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let namespace = workspace_namespace(collection, scope)?;
    let _guard = io_lock().lock().map_err(|_| "Yerel kasa I/O kilidi kullanılamıyor.".to_string())?;
    let mut payload = load_payload_unlocked(app)?;
    if merge_workspace_items(&mut payload, namespace.clone(), items, false)? { save_payload_unlocked(app, &payload)?; }
    Ok(payload.workspace.get(&namespace).map(active_workspace_values).unwrap_or_default())
}

pub fn workspace_import_legacy(app: &tauri::AppHandle, collection: &str, scope: &str, items: Vec<Value>) -> Result<Vec<Value>, String> {
    let namespace = workspace_namespace(collection, scope)?;
    let _guard = io_lock().lock().map_err(|_| "Yerel kasa I/O kilidi kullanılamıyor.".to_string())?;
    let mut payload = load_payload_unlocked(app)?;
    if merge_workspace_items(&mut payload, namespace.clone(), items, true)? { save_payload_unlocked(app, &payload)?; }
    Ok(payload.workspace.get(&namespace).map(active_workspace_values).unwrap_or_default())
}


fn workspace_sync_namespace_allowed(namespace: &str) -> bool {
    let Some((collection, scope)) = namespace.split_once(':') else { return false; };
    workspace_namespace(collection, scope).map(|expected| expected == namespace).unwrap_or(false)
}

pub fn workspace_sync_export(app: &tauri::AppHandle) -> Result<Value, String> {
    let _guard = io_lock().lock().map_err(|_| "Yerel kasa I/O kilidi kullanılamıyor.".to_string())?;
    let payload = load_payload_unlocked(app)?;
    let collections = payload.workspace.iter()
        .filter(|(namespace, _)| workspace_sync_namespace_allowed(namespace))
        .map(|(namespace, collection)| json!({
            "namespace": namespace,
            "schemaVersion": collection.schema_version,
            "records": collection.records
        }))
        .collect::<Vec<_>>();

    Ok(json!({
        "schemaVersion": workspace_schema_version(),
        "deviceId": payload.device_id,
        "exportedAt": Utc::now().to_rfc3339(),
        "collections": collections
    }))
}

pub fn workspace_sync_merge(app: &tauri::AppHandle, remote: Value) -> Result<Value, String> {
    let schema_version = remote.get("schemaVersion").and_then(Value::as_u64).unwrap_or(0) as u32;
    if schema_version == 0 || schema_version > workspace_schema_version() {
        return Err("Desteklenmeyen cloud workspace şema sürümü.".to_string());
    }
    let remote_collections = remote.get("collections").and_then(Value::as_array)
        .ok_or_else(|| "Cloud workspace collections alanı eksik.".to_string())?;

    let _guard = io_lock().lock().map_err(|_| "Yerel kasa I/O kilidi kullanılamıyor.".to_string())?;
    let mut payload = load_payload_unlocked(app)?;
    let mut changed = false;
    let mut merged_records = 0usize;
    let mut conflicts = Vec::new();

    for remote_collection in remote_collections {
        let namespace = remote_collection.get("namespace").and_then(Value::as_str)
            .ok_or_else(|| "Cloud workspace namespace eksik.".to_string())?;
        if !workspace_sync_namespace_allowed(namespace) {
            return Err(format!("Geçersiz cloud workspace namespace: {namespace}"));
        }
        let collection_schema = remote_collection.get("schemaVersion").and_then(Value::as_u64).unwrap_or(0) as u32;
        if collection_schema == 0 || collection_schema > workspace_schema_version() {
            return Err(format!("Desteklenmeyen collection şema sürümü: {namespace}"));
        }
        let remote_records = remote_collection.get("records").and_then(Value::as_array)
            .ok_or_else(|| format!("Cloud workspace records alanı eksik: {namespace}"))?
            .iter()
            .cloned()
            .map(|value| serde_json::from_value::<WorkspaceRecord>(value).map_err(|error| error.to_string()))
            .collect::<Result<Vec<_>, _>>()?;

        let local_collection = payload.workspace.entry(namespace.to_string()).or_default();
        local_collection.schema_version = workspace_schema_version();

        for remote_record in remote_records {
            if remote_record.id.trim().is_empty() || remote_record.id.len() > 200 {
                return Err(format!("Geçersiz cloud workspace record id: {namespace}"));
            }

            if let Some(index) = local_collection.records.iter().position(|record| record.id == remote_record.id) {
                let local_record = &local_collection.records[index];
                let identical = local_record.revision == remote_record.revision
                    && local_record.updated_at == remote_record.updated_at
                    && local_record.deleted_at == remote_record.deleted_at
                    && local_record.updated_by_device == remote_record.updated_by_device
                    && local_record.payload == remote_record.payload;

                if identical {
                    continue;
                }

                if remote_record.revision > local_record.revision {
                    local_collection.records[index] = remote_record;
                    merged_records += 1;
                    changed = true;
                    continue;
                }

                if remote_record.revision < local_record.revision {
                    continue;
                }

                if remote_record.updated_by_device == local_record.updated_by_device {
                    if remote_record.updated_at > local_record.updated_at {
                        local_collection.records[index] = remote_record;
                        merged_records += 1;
                        changed = true;
                    }
                    continue;
                }

                conflicts.push(json!({
                    "namespace": namespace,
                    "recordId": local_record.id,
                    "revision": local_record.revision,
                    "localUpdatedAt": local_record.updated_at,
                    "remoteUpdatedAt": remote_record.updated_at,
                    "localDeviceId": local_record.updated_by_device,
                    "remoteDeviceId": remote_record.updated_by_device
                }));
            } else {
                local_collection.records.push(remote_record);
                merged_records += 1;
                changed = true;
            }
        }
    }

    if changed {
        save_payload_unlocked(app, &payload)?;
    }

    Ok(json!({
        "mergedRecords": merged_records,
        "conflicts": conflicts,
        "hasConflicts": !conflicts.is_empty(),
        "deviceId": payload.device_id,
        "schemaVersion": workspace_schema_version()
    }))
}

pub fn workspace_sync_manifest(app: &tauri::AppHandle) -> Result<Value, String> {
    let _guard = io_lock().lock().map_err(|_| "Yerel kasa I/O kilidi kullanılamıyor.".to_string())?;
    let payload = load_payload_unlocked(app)?;
    let collections = payload.workspace.iter().map(|(namespace, collection)| {
        let active = collection.records.iter().filter(|record| record.deleted_at.is_none()).count();
        json!({
            "namespace": namespace,
            "schemaVersion": collection.schema_version,
            "activeRecords": active,
            "tombstones": collection.records.len().saturating_sub(active),
            "maxRevision": collection.records.iter().map(|record| record.revision).max().unwrap_or(0)
        })
    }).collect::<Vec<_>>();
    Ok(json!({
        "workspaceSchemaVersion": workspace_schema_version(),
        "deviceId": payload.device_id,
        "conflictModel": "record-revision+tombstone+device-id",
        "collections": collections
    }))
}

pub fn password_for_server(app: &tauri::AppHandle, server_id: &str) -> Result<String, String> {
    let _guard = io_lock().lock()
        .map_err(|_| "Yerel kasa I/O kilidi kullanılamıyor.".to_string())?;
    load_payload_unlocked(app)?.connections.iter()
        .find(|connection| connection_id(connection) == Some(server_id))
        .and_then(connection_password)
        .ok_or_else(|| "Bu sunucu için güvenli kasada parola bulunamadı.".to_string())
}

pub fn status(app: &tauri::AppHandle) -> Result<VaultStatus, String> {
    let _guard = io_lock().lock()
        .map_err(|_| "Yerel kasa I/O kilidi kullanılamıyor.".to_string())?;
    let path = vault_file(app)?;
    let key_available = if path.exists() {
        cached_key()?.is_some() || platform_secret::read()?.is_some()
    } else {
        cached_key()?.is_some()
    };
    let connection_count = if path.exists() && key_available {
        load_payload_unlocked(app)?.connections.len()
    } else {
        0
    };

    Ok(VaultStatus {
        encrypted: true,
        local_vault_version: VAULT_VERSION,
        algorithm: VAULT_ALGORITHM.to_string(),
        key_backend: platform_secret::backend_name().to_string(),
        key_available,
        connection_count,
        vault_path: path.to_string_lossy().into_owned(),
    })
}

pub fn cloud_readiness_metadata() -> Value {
    json!({
        "envelopeVersion": 1,
        "payloadCipher": "AES-256-GCM",
        "vaultKeyBytes": 32,
        "passwordKdf": "Argon2id",
        "workspaceSchemaVersion": workspace_schema_version(),
        "syncableCollections": SYNCABLE_WORKSPACE_COLLECTIONS,
        "conflictModel": "record-revision+tombstone+device-id",
        "zeroKnowledge": true,
        "masterPasswordStored": false
    })
}

#[cfg(target_os = "windows")]
mod platform_secret {
    use super::{DEVICE_KEY_ACCOUNT, DEVICE_KEY_SERVICE};
    use std::{ffi::c_void, iter::once, os::windows::ffi::OsStrExt, ptr::null_mut};
    use windows_sys::Win32::{
        Foundation::{GetLastError, ERROR_NOT_FOUND},
        Security::Credentials::{
            CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
            CRED_TYPE_GENERIC,
        },
    };

    fn wide(value: &str) -> Vec<u16> {
        std::ffi::OsStr::new(value).encode_wide().chain(once(0)).collect()
    }

    pub fn backend_name() -> &'static str { "windows-credential-manager" }

    pub fn read() -> Result<Option<Vec<u8>>, String> {
        let target = wide(DEVICE_KEY_SERVICE);
        let mut raw: *mut CREDENTIALW = null_mut();
        let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut raw) };
        if ok == 0 {
            let error = unsafe { GetLastError() };
            if error == ERROR_NOT_FOUND {
                return Ok(None);
            }
            return Err(format!("Windows Credential Manager anahtarı okunamadı (Win32 {error})."));
        }
        if raw.is_null() {
            return Err("Windows Credential Manager boş credential döndürdü.".to_string());
        }

        let credential = unsafe { &*raw };
        let bytes = if credential.CredentialBlob.is_null() || credential.CredentialBlobSize == 0 {
            Vec::new()
        } else {
            unsafe {
                std::slice::from_raw_parts(credential.CredentialBlob, credential.CredentialBlobSize as usize).to_vec()
            }
        };
        unsafe { CredFree(raw as *const c_void) };
        Ok(Some(bytes))
    }

    pub fn write(secret: &[u8]) -> Result<(), String> {
        let mut target = wide(DEVICE_KEY_SERVICE);
        let mut username = wide(DEVICE_KEY_ACCOUNT);
        let mut credential: CREDENTIALW = unsafe { std::mem::zeroed() };
        credential.Type = CRED_TYPE_GENERIC;
        credential.TargetName = target.as_mut_ptr();
        credential.CredentialBlobSize = secret.len() as u32;
        credential.CredentialBlob = secret.as_ptr() as *mut u8;
        credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
        credential.UserName = username.as_mut_ptr();

        let ok = unsafe { CredWriteW(&credential, 0) };
        if ok == 0 {
            let error = unsafe { GetLastError() };
            return Err(format!("Windows Credential Manager anahtarı kaydedemedi (Win32 {error})."));
        }
        Ok(())
    }
}

#[cfg(target_os = "macos")]
mod platform_secret {
    use super::{DEVICE_KEY_ACCOUNT, DEVICE_KEY_SERVICE};
    use security_framework::os::macos::{keychain::SecKeychain, passwords::find_generic_password};

    pub fn backend_name() -> &'static str { "macos-keychain" }

    pub fn read() -> Result<Option<Vec<u8>>, String> {
        match find_generic_password(None, DEVICE_KEY_SERVICE, DEVICE_KEY_ACCOUNT) {
            Ok((password, _item)) => Ok(Some(password.as_ref().to_vec())),
            Err(_) => Ok(None),
        }
    }

    pub fn write(secret: &[u8]) -> Result<(), String> {
        SecKeychain::default()
            .map_err(|error| format!("macOS Keychain açılamadı: {error}"))?
            .set_generic_password(DEVICE_KEY_SERVICE, DEVICE_KEY_ACCOUNT, secret)
            .map_err(|error| format!("macOS Keychain anahtarı kaydedemedi: {error}"))
    }
}

#[cfg(target_os = "linux")]
mod platform_secret {
    use super::{BASE64, DEVICE_KEY_ACCOUNT, DEVICE_KEY_SERVICE};
    use base64::Engine as _;
    use std::{io::Write, process::{Command, Stdio}};

    pub fn backend_name() -> &'static str { "linux-secret-service" }

    fn base_command() -> Command {
        let mut command = Command::new("secret-tool");
        command.args(["lookup", "application", DEVICE_KEY_SERVICE, "account", DEVICE_KEY_ACCOUNT]);
        command
    }

    pub fn read() -> Result<Option<Vec<u8>>, String> {
        let output = base_command().output().map_err(|error| {
            format!("Linux Secret Service erişilemiyor. 'secret-tool' (libsecret-tools) gerekli: {error}")
        })?;
        if !output.status.success() {
            return Ok(None);
        }
        let encoded = String::from_utf8(output.stdout)
            .map_err(|_| "Linux Secret Service geçersiz veri döndürdü.".to_string())?;
        let encoded = encoded.trim();
        if encoded.is_empty() {
            return Ok(None);
        }
        let secret = BASE64.decode(encoded)
            .map_err(|_| "Linux Secret Service cihaz anahtarı bozuk.".to_string())?;
        Ok(Some(secret))
    }

    pub fn write(secret: &[u8]) -> Result<(), String> {
        let mut child = Command::new("secret-tool")
            .args([
                "store",
                "--label=Coreor Database local vault key",
                "application",
                DEVICE_KEY_SERVICE,
                "account",
                DEVICE_KEY_ACCOUNT,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                format!("Linux Secret Service erişilemiyor. 'secret-tool' (libsecret-tools) gerekli: {error}")
            })?;

        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(BASE64.encode(secret).as_bytes()).map_err(|error| error.to_string())?;
        }

        let output = child.wait_with_output().map_err(|error| error.to_string())?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Linux Secret Service anahtarı kaydedemedi: {}", stderr.trim()));
        }
        Ok(())
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod platform_secret {
    pub fn backend_name() -> &'static str { "unsupported" }
    pub fn read() -> Result<Option<Vec<u8>>, String> {
        Err("Bu platform için güvenli cihaz anahtarı deposu desteklenmiyor.".to_string())
    }
    pub fn write(_secret: &[u8]) -> Result<(), String> {
        Err("Bu platform için güvenli cihaz anahtarı deposu desteklenmiyor.".to_string())
    }
}
