mod database;
mod transactions;

use database::DatabaseRequest;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, path::PathBuf, time::Duration};
use tauri::{Manager, State};
use transactions::TransactionStore;

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
    fn default()->Self{Self{version:config_version(),query_timeout_ms:default_query_timeout(),max_result_rows:default_max_rows(),max_page_size:default_page_size(),connections:Vec::new()}}
}
fn config_version()->u32{1}
fn default_query_timeout()->u64{120_000}
fn default_max_rows()->usize{50_000}
fn default_page_size()->usize{10_000}

fn config_file(app:&tauri::AppHandle)->Result<PathBuf,String>{
    let dir=app.path().app_config_dir().map_err(|e|e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    Ok(dir.join("config.json"))
}
#[tauri::command]
fn config_path(app:tauri::AppHandle)->Result<String,String>{Ok(config_file(&app)?.to_string_lossy().into_owned())}
#[tauri::command]
fn read_config(app:tauri::AppHandle)->Result<DesktopConfig,String>{
    let path=config_file(&app)?;
    if !path.exists(){let c=DesktopConfig::default();fs::write(&path,serde_json::to_vec_pretty(&c).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;return Ok(c)}
    serde_json::from_slice(&fs::read(path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())
}
#[tauri::command]
fn write_config(app:tauri::AppHandle,config:DesktopConfig)->Result<(),String>{
    let path=config_file(&app)?;let tmp=path.with_extension("json.tmp");
    fs::write(&tmp,serde_json::to_vec_pretty(&config).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    fs::rename(tmp,path).map_err(|e|e.to_string())
}

#[tauri::command]
async fn database_request(app:tauri::AppHandle,state:State<'_,TransactionStore>,request:DatabaseRequest)->Result<Value,String>{
    let config=read_config(app)?;
    if transactions::is_transaction_action(&request.action){
        let transaction_id=request.payload.get("transactionId").and_then(Value::as_str).map(ToOwned::to_owned);
        match tokio::time::timeout(Duration::from_millis(config.query_timeout_ms),transactions::handle(request,&state,config.max_result_rows)).await {
            Ok(result)=>return result,
            Err(_)=>{
                if let Some(id)=transaction_id { transactions::discard(&state,&id).await; }
                return Err("Transaction işlemi zaman aşımına uğradı; güvenlik için transaction oturumu kapatıldı.".into());
            }
        }
    }
    let max_page_size=config.max_page_size.max(10_000);
    tokio::time::timeout(Duration::from_millis(config.query_timeout_ms),database::execute_action(request,config.max_result_rows,max_page_size))
        .await.map_err(|_|"Veritabanı işlemi zaman aşımına uğradı.".to_string())?
}

#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run(){
    tauri::Builder::default()
        .manage(TransactionStore::default())
        .invoke_handler(tauri::generate_handler![config_path,read_config,write_config,database_request])
        .run(tauri::generate_context!())
        .expect("Coreor Database başlatılamadı");
}
