use crate::database::{open_native, execute_on, is_mutating, Connection, DatabaseRequest, NativeConnection};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::sync::Mutex;
use uuid::Uuid;

const TX_TTL_MINUTES: i64 = 15;
const MAX_TX_STATEMENTS: usize = 500;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all="camelCase")]
struct TxStatement {
    id: String,
    sql: String,
    executed_at: String,
    duration_ms: u64,
    row_count: usize,
    affected_rows: u64,
    status: String,
    #[serde(skip_serializing_if="Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all="camelCase")]
struct TxPublic {
    transaction_id: String,
    database: Option<String>,
    started_at: String,
    last_activity_at: String,
    expires_at: String,
    statements: Vec<TxStatement>,
}

struct TxSession {
    id: String,
    database: Option<String>,
    started_at: DateTime<Utc>,
    last_activity_at: DateTime<Utc>,
    statements: Vec<TxStatement>,
    connection: NativeConnection,
    read_only: bool,
}

impl TxSession {
    fn public(&self)->TxPublic{
        TxPublic{
            transaction_id:self.id.clone(),database:self.database.clone(),started_at:self.started_at.to_rfc3339(),
            last_activity_at:self.last_activity_at.to_rfc3339(),expires_at:(self.last_activity_at+ChronoDuration::minutes(TX_TTL_MINUTES)).to_rfc3339(),
            statements:self.statements.clone()
        }
    }
}

#[derive(Default)]
pub struct TransactionStore(Mutex<HashMap<String,TxSession>>);

async fn cleanup(store:&TransactionStore){
    let mut map=store.0.lock().await;let now=Utc::now();
    let expired=map.iter().filter(|(_,s)|s.last_activity_at+ChronoDuration::minutes(TX_TTL_MINUTES)<now).map(|(k,_)|k.clone()).collect::<Vec<_>>();
    for id in expired{if let Some(mut s)=map.remove(&id){let _=execute_on(&mut s.connection,"ROLLBACK",1).await;}}
}

pub fn is_transaction_action(action:&str)->bool{action.starts_with("transaction-")}

pub async fn discard(store:&TransactionStore,id:&str){
    let mut map=store.0.lock().await;
    map.remove(id);
}

pub async fn handle(request:DatabaseRequest,store:&TransactionStore,max_rows:usize)->Result<Value,String>{
    cleanup(store).await;
    match request.action.as_str(){
        "transaction-begin"=>{
            let c:Connection=request.connection.ok_or("Transaction bağlantısı eksik.")?;
            let db=request.payload.get("database").and_then(Value::as_str).map(ToOwned::to_owned).or(c.database.clone());
            let mut conn=open_native(&c,db.as_deref()).await?;
            execute_on(&mut conn,"BEGIN",1).await?;
            if c.read_only {
                match c.engine.as_str() {
                    "postgresql" | "cockroachdb" => { execute_on(&mut conn,"SET TRANSACTION READ ONLY",1).await?; }
                    "mysql" | "mariadb" | "tidb" => { execute_on(&mut conn,"SET TRANSACTION READ ONLY",1).await?; }
                    _ => {}
                }
            }
            let now=Utc::now();let id=Uuid::new_v4().to_string();
            let session=TxSession{id:id.clone(),database:db,started_at:now,last_activity_at:now,statements:Vec::new(),connection:conn,read_only:c.read_only};
            let public=session.public();store.0.lock().await.insert(id,session);
            Ok(json!({"transaction":public}))
        }
        "transaction-query"=>{
            let id=request.payload.get("transactionId").and_then(Value::as_str).ok_or("Transaction ID eksik.")?.to_string();
            let sql=request.payload.get("sql").and_then(Value::as_str).ok_or("SQL eksik.")?.trim().to_string();
            if sql.is_empty(){return Err("SQL boş olamaz.".into())}
            let mut map=store.0.lock().await;let s=map.get_mut(&id).ok_or("Transaction bulunamadı veya süresi doldu.")?;
            if s.read_only && is_mutating(&sql){return Err("Bu transaction salt okunur; yazma sorgusu engellendi.".into())}
            if s.statements.len()>=MAX_TX_STATEMENTS{return Err("Transaction statement sınırına ulaştı.".into())}
            let started=std::time::Instant::now();let result=execute_on(&mut s.connection,&sql,max_rows).await;
            let duration=started.elapsed().as_millis() as u64;s.last_activity_at=Utc::now();
            match result{
                Ok(result)=>{
                    let row_count=result.get("rows").and_then(Value::as_array).map(|x|x.len()).unwrap_or(0);
                    let affected=result.get("affectedRows").and_then(Value::as_u64).unwrap_or(0);
                    s.statements.push(TxStatement{id:Uuid::new_v4().to_string(),sql,executed_at:Utc::now().to_rfc3339(),duration_ms:duration,row_count,affected_rows:affected,status:"success".into(),error:None});
                    Ok(json!({"transaction":s.public(),"result":result}))
                }
                Err(error)=>{
                    s.statements.push(TxStatement{id:Uuid::new_v4().to_string(),sql,executed_at:Utc::now().to_rfc3339(),duration_ms:duration,row_count:0,affected_rows:0,status:"error".into(),error:Some(error.clone())});
                    Err(error)
                }
            }
        }
        "transaction-commit"|"transaction-rollback"=>{
            let id=request.payload.get("transactionId").and_then(Value::as_str).ok_or("Transaction ID eksik.")?.to_string();
            let mut map=store.0.lock().await;let mut s=map.remove(&id).ok_or("Transaction bulunamadı veya süresi doldu.")?;
            let statement_count=s.statements.len();let commit=request.action=="transaction-commit";
            execute_on(&mut s.connection,if commit{"COMMIT"}else{"ROLLBACK"},1).await?;
            Ok(json!({"transactionId":id,"status":if commit{"committed"}else{"rolled-back"},"statementCount":statement_count}))
        }
        "transaction-status"=>{
            let map=store.0.lock().await;let items=map.values().map(TxSession::public).collect::<Vec<_>>();
            Ok(json!({"transactions":items}))
        }
        _=>Err("Desteklenmeyen transaction action.".into())
    }
}
