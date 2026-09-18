use chrono::{NaiveDate, NaiveDateTime, NaiveTime, Utc};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use sqlx::{Column, Connection as SqlxConnection, Executor, Row};
use std::time::Duration;
use tiberius::{AuthMethod, Client, Config, EncryptionLevel};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

pub type MssqlClient = Client<Compat<TcpStream>>;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub engine: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub database: Option<String>,
    #[serde(default = "default_ssl_mode")]
    pub ssl_mode: String,
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout_ms: u64,
    #[serde(default)]
    pub read_only: bool,
}

fn default_ssl_mode() -> String { "required".into() }
fn default_connect_timeout() -> u64 { 20_000 }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseRequest {
    pub action: String,
    pub connection: Option<Connection>,
    #[serde(flatten)]
    pub payload: Map<String, Value>,
}

pub enum NativeConnection {
    MySql(sqlx::MySqlConnection),
    Postgres(sqlx::PgConnection),
    Mssql(MssqlClient),
}

fn is_pg(engine: &str) -> bool { matches!(engine, "postgresql" | "cockroachdb") }
fn is_mssql(engine: &str) -> bool { engine == "mssql" }

fn mysql_url(c: &Connection, database: Option<&str>) -> String {
    let db = database.or(c.database.as_deref()).unwrap_or("");
    let ssl = match c.ssl_mode.as_str() { "disabled" => "DISABLED", "preferred" => "PREFERRED", _ => "REQUIRED" };
    format!("mysql://{}:{}@{}:{}/{}?ssl-mode={}", urlencoding::encode(&c.username), urlencoding::encode(&c.password), c.host, c.port, db, ssl)
}

fn postgres_url(c: &Connection, database: Option<&str>) -> String {
    let db = database.or(c.database.as_deref()).unwrap_or("postgres");
    let ssl = match c.ssl_mode.as_str() { "disabled" => "disable", "preferred" => "prefer", _ => "require" };
    format!("postgres://{}:{}@{}:{}/{}?sslmode={}", urlencoding::encode(&c.username), urlencoding::encode(&c.password), c.host, c.port, db, ssl)
}

pub async fn open_native(c: &Connection, database: Option<&str>) -> Result<NativeConnection, String> {
    if is_mssql(&c.engine) {
        let mut cfg = Config::new();
        cfg.host(&c.host);
        cfg.port(c.port);
        cfg.authentication(AuthMethod::sql_server(c.username.clone(), c.password.clone()));
        if let Some(db) = database.or(c.database.as_deref()) { if !db.is_empty() { cfg.database(db); } }
        match c.ssl_mode.as_str() { "disabled" => cfg.encryption(EncryptionLevel::NotSupported), "preferred" => { cfg.encryption(EncryptionLevel::On); cfg.trust_cert(); }, _ => cfg.encryption(EncryptionLevel::Required) }
        let tcp = tokio::time::timeout(Duration::from_millis(c.connect_timeout_ms), TcpStream::connect(cfg.get_addr()))
            .await.map_err(|_| "MSSQL bağlantısı zaman aşımına uğradı.".to_string())?.map_err(|e| e.to_string())?;
        tcp.set_nodelay(true).map_err(|e| e.to_string())?;
        let client = Client::connect(cfg, tcp.compat_write()).await.map_err(|e| e.to_string())?;
        return Ok(NativeConnection::Mssql(client));
    }
    if is_pg(&c.engine) {
        let conn = tokio::time::timeout(Duration::from_millis(c.connect_timeout_ms), sqlx::PgConnection::connect(&postgres_url(c, database)))
            .await.map_err(|_| "PostgreSQL bağlantısı zaman aşımına uğradı.".to_string())?.map_err(|e| e.to_string())?;
        return Ok(NativeConnection::Postgres(conn));
    }
    let conn = tokio::time::timeout(Duration::from_millis(c.connect_timeout_ms), sqlx::MySqlConnection::connect(&mysql_url(c, database)))
        .await.map_err(|_| "MySQL bağlantısı zaman aşımına uğradı.".to_string())?.map_err(|e| e.to_string())?;
    Ok(NativeConnection::MySql(conn))
}

fn mysql_cell(row: &sqlx::mysql::MySqlRow, i: usize) -> Value {
    if let Ok(v) = row.try_get::<Option<String>, _>(i) { return v.map(Value::String).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<i64>, _>(i) { return v.map(|x| json!(x)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<u64>, _>(i) { return v.map(|x| json!(x)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<f64>, _>(i) { return v.map(|x| json!(x)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<bool>, _>(i) { return v.map(|x| json!(x)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<NaiveDateTime>, _>(i) { return v.map(|x| json!(x.to_string())).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<NaiveDate>, _>(i) { return v.map(|x| json!(x.to_string())).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<NaiveTime>, _>(i) { return v.map(|x| json!(x.to_string())).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(i) { return v.map(|x| json!({"type":"binary","base64":base64::Engine::encode(&base64::engine::general_purpose::STANDARD,x)})).unwrap_or(Value::Null); }
    Value::Null
}

fn pg_cell(row: &sqlx::postgres::PgRow, i: usize) -> Value {
    if let Ok(v) = row.try_get::<Option<String>, _>(i) { return v.map(Value::String).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<i64>, _>(i) { return v.map(|x| json!(x)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<i32>, _>(i) { return v.map(|x| json!(x)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<i16>, _>(i) { return v.map(|x| json!(x)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<f64>, _>(i) { return v.map(|x| json!(x)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<f32>, _>(i) { return v.map(|x| json!(x)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<bool>, _>(i) { return v.map(|x| json!(x)).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<NaiveDateTime>, _>(i) { return v.map(|x| json!(x.to_string())).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<NaiveDate>, _>(i) { return v.map(|x| json!(x.to_string())).unwrap_or(Value::Null); }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(i) { return v.map(|x| json!({"type":"binary","base64":base64::Engine::encode(&base64::engine::general_purpose::STANDARD,x)})).unwrap_or(Value::Null); }
    Value::Null
}

fn mssql_row(row: &tiberius::Row) -> Value {
    let mut obj = Map::new();
    for (i, col) in row.columns().iter().enumerate() {
        let value = if let Ok(v) = row.try_get::<&str, _>(i) { v.map(|x| json!(x)).unwrap_or(Value::Null) }
        else if let Ok(v) = row.try_get::<i64, _>(i) { v.map(|x| json!(x)).unwrap_or(Value::Null) }
        else if let Ok(v) = row.try_get::<i32, _>(i) { v.map(|x| json!(x)).unwrap_or(Value::Null) }
        else if let Ok(v) = row.try_get::<i16, _>(i) { v.map(|x| json!(x)).unwrap_or(Value::Null) }
        else if let Ok(v) = row.try_get::<u8, _>(i) { v.map(|x| json!(x)).unwrap_or(Value::Null) }
        else if let Ok(v) = row.try_get::<f64, _>(i) { v.map(|x| json!(x)).unwrap_or(Value::Null) }
        else if let Ok(v) = row.try_get::<f32, _>(i) { v.map(|x| json!(x)).unwrap_or(Value::Null) }
        else if let Ok(v) = row.try_get::<bool, _>(i) { v.map(|x| json!(x)).unwrap_or(Value::Null) }
        else if let Ok(v) = row.try_get::<NaiveDateTime, _>(i) { v.map(|x| json!(x.to_string())).unwrap_or(Value::Null) }
        else if let Ok(v) = row.try_get::<NaiveDate, _>(i) { v.map(|x| json!(x.to_string())).unwrap_or(Value::Null) }
        else if let Ok(v) = row.try_get::<NaiveTime, _>(i) { v.map(|x| json!(x.to_string())).unwrap_or(Value::Null) }
        else if let Ok(v) = row.try_get::<&[u8], _>(i) { v.map(|x| json!({"type":"binary","base64":base64::Engine::encode(&base64::engine::general_purpose::STANDARD,x)})).unwrap_or(Value::Null) }
        else { Value::Null };
        obj.insert(col.name().to_string(), value);
    }
    Value::Object(obj)
}

fn returns_rows(sql: &str) -> bool {
    let s = sql.trim_start().to_ascii_lowercase();
    ["select", "show", "describe", "desc", "explain", "with", "pragma", "exec", "execute"].iter().any(|x| s.starts_with(x))
}

pub async fn execute_on(conn: &mut NativeConnection, sql: &str, limit: usize) -> Result<Value, String> {
    match conn {
        NativeConnection::MySql(c) => {
            if returns_rows(sql) {
                let rows = sqlx::query(sql).fetch_all(&mut *c).await.map_err(|e| e.to_string())?;
                let out = rows.into_iter().take(limit).map(|row| {
                    let mut obj=Map::new();
                    for (i,col) in row.columns().iter().enumerate(){ obj.insert(col.name().to_string(), mysql_cell(&row,i)); }
                    Value::Object(obj)
                }).collect::<Vec<_>>();
                Ok(json!({"rows":out,"affectedRows":0}))
            } else {
                let r=sqlx::query(sql).execute(&mut *c).await.map_err(|e| e.to_string())?;
                Ok(json!({"rows":[],"affectedRows":r.rows_affected(),"insertId":r.last_insert_id()}))
            }
        }
        NativeConnection::Postgres(c) => {
            if returns_rows(sql) {
                let rows=sqlx::query(sql).fetch_all(&mut *c).await.map_err(|e| e.to_string())?;
                let out=rows.into_iter().take(limit).map(|row|{
                    let mut obj=Map::new();
                    for (i,col) in row.columns().iter().enumerate(){obj.insert(col.name().to_string(),pg_cell(&row,i));}
                    Value::Object(obj)
                }).collect::<Vec<_>>();
                Ok(json!({"rows":out,"affectedRows":0}))
            } else {
                let r=sqlx::query(sql).execute(&mut *c).await.map_err(|e| e.to_string())?;
                Ok(json!({"rows":[],"affectedRows":r.rows_affected()}))
            }
        }
        NativeConnection::Mssql(c) => {
            if returns_rows(sql) {
                let rows=c.simple_query(sql).await.map_err(|e|e.to_string())?.into_first_result().await.map_err(|e|e.to_string())?;
                let out=rows.iter().take(limit).map(mssql_row).collect::<Vec<_>>();
                Ok(json!({"rows":out,"affectedRows":0}))
            } else {
                let affected=c.execute(sql,&[]).await.map_err(|e|e.to_string())?.total();
                Ok(json!({"rows":[],"affectedRows":affected}))
            }
        }
    }
}

pub async fn execute_sql(c: &Connection, sql: &str, database: Option<&str>, limit: usize) -> Result<Value,String> {
    let mut conn=open_native(c,database).await?;
    if c.read_only && is_mutating(sql) { return Err("Bu bağlantı salt okunur modda.".into()); }
    execute_on(&mut conn,sql,limit).await
}

fn is_mutating(sql:&str)->bool{
    let keywords=["insert","update","delete","replace","merge","alter","create","drop","truncate","rename","grant","revoke","call","exec ","execute ","kill","begin","start transaction","commit","rollback"];
    sql.split(';').any(|statement|{
        let s=statement.trim_start().to_ascii_lowercase();
        if keywords.iter().any(|x|s.starts_with(x)){return true}
        s.starts_with("with ") && [" insert "," update "," delete "," merge "].iter().any(|x|s.contains(x))
    })
}

fn ident(raw:&str, engine:&str)->Result<String,String>{
    let s=raw.trim();
    if s.is_empty()||s.len()>128||s.contains('\0'){return Err("Geçersiz veritabanı tanımlayıcısı.".into());}
    if is_mssql(engine){Ok(format!("[{}]",s.replace(']',"]]")))}
    else if is_pg(engine){Ok(format!("\"{}\"",s.replace('"',"\"\"")))}
    else{Ok(format!("`{}`",s.replace('`',"``")))}
}
fn qualified(db:&str,table:&str,engine:&str)->Result<String,String>{
    if is_pg(engine){Ok(format!("{}.{}",ident("public",engine)?,ident(table,engine)?))}
    else if is_mssql(engine){Ok(format!("{}.{}",ident("dbo",engine)?,ident(table,engine)?))}
    else{Ok(format!("{}.{}",ident(db,engine)?,ident(table,engine)?))}
}
fn literal(v:&Value,engine:&str)->String{
    match v{
        Value::Null=>"NULL".into(),Value::Bool(x)=>if *x{"1".into()}else{"0".into()},Value::Number(x)=>x.to_string(),
        Value::String(x)=>format!("{}'{}'",if is_mssql(engine){"N"}else{""},x.replace("'","''")),
        Value::Object(o) if o.get("type").and_then(Value::as_str)==Some("binary")=>{
            let encoded=o.get("base64").and_then(Value::as_str).unwrap_or("");
            if is_pg(engine){format!("decode('{}','base64')",encoded.replace("'","''"))}
            else if is_mssql(engine){
                match base64::Engine::decode(&base64::engine::general_purpose::STANDARD,encoded){Ok(bytes)=>format!("0x{}",bytes.iter().map(|b|format!("{:02X}",b)).collect::<String>()),Err(_)=>"NULL".into()}
            }else{format!("FROM_BASE64('{}')",encoded.replace("'","''"))}
        }
        _=>format!("{}'{}'",if is_mssql(engine){"N"}else{""},v.to_string().replace("'","''"))
    }
}
fn payload_str<'a>(p:&'a Map<String,Value>,key:&str)->Result<&'a str,String>{p.get(key).and_then(Value::as_str).ok_or_else(||format!("{} eksik.",key))}
fn rows_of(v:&Value)->Vec<Value>{v.get("rows").and_then(Value::as_array).cloned().unwrap_or_default()}
fn num(v:Option<&Value>)->u64{v.and_then(Value::as_u64).or_else(||v.and_then(Value::as_i64).map(|x|x.max(0) as u64)).or_else(||v.and_then(Value::as_str).and_then(|x|x.parse().ok())).unwrap_or(0)}

fn build_filters(payload:&Map<String,Value>,engine:&str)->Result<(String,Vec<Value>),String>{
    let mut parts=Vec::new(); let mut normalized=Vec::new();
    if let Some(filters)=payload.get("filters").and_then(Value::as_array){
        for f in filters.iter().take(12){
            let Some(o)=f.as_object() else{continue}; let Some(col)=o.get("column").and_then(Value::as_str) else{continue};
            let op=o.get("operator").and_then(Value::as_str).unwrap_or(""); let val=o.get("value").cloned().unwrap_or(Value::String(String::new()));
            let q=ident(col,engine)?; let text=val.as_str().unwrap_or("");
            let clause=match op{
                "contains" if !text.is_empty()=>format!("CAST({} AS {}) LIKE {}",q,if is_mssql(engine){"NVARCHAR(MAX)"}else{"TEXT"},literal(&json!(format!("%{}%",text)),engine)),
                "startsWith" if !text.is_empty()=>format!("CAST({} AS {}) LIKE {}",q,if is_mssql(engine){"NVARCHAR(MAX)"}else{"TEXT"},literal(&json!(format!("{}%",text)),engine)),
                "endsWith" if !text.is_empty()=>format!("CAST({} AS {}) LIKE {}",q,if is_mssql(engine){"NVARCHAR(MAX)"}else{"TEXT"},literal(&json!(format!("%{}",text)),engine)),
                "equals"=>if is_pg(engine){format!("{} IS NOT DISTINCT FROM {}",q,literal(&val,engine))}else{format!("{} = {}",q,literal(&val,engine))},
                "gt"=>format!("{} > {}",q,literal(&val,engine)),"gte"=>format!("{} >= {}",q,literal(&val,engine)),
                "lt"=>format!("{} < {}",q,literal(&val,engine)),"lte"=>format!("{} <= {}",q,literal(&val,engine)),
                "isNull"=>format!("{} IS NULL",q),"isNotNull"=>format!("{} IS NOT NULL",q),_=>continue
            };
            parts.push(clause); normalized.push(f.clone());
        }
    }
    Ok((if parts.is_empty(){String::new()}else{format!(" WHERE {}",parts.join(" AND "))},normalized))
}
fn build_sorts(payload:&Map<String,Value>,engine:&str)->Result<(String,Vec<Value>),String>{
    let mut parts=Vec::new();let mut normalized=Vec::new();
    if let Some(sorts)=payload.get("sorts").and_then(Value::as_array){
        for s in sorts.iter().take(5){let Some(o)=s.as_object()else{continue};let Some(c)=o.get("column").and_then(Value::as_str)else{continue};let d=o.get("direction").and_then(Value::as_str).unwrap_or("asc");if d!="asc"&&d!="desc"{continue}parts.push(format!("{} {}",ident(c,engine)?,d.to_ascii_uppercase()));normalized.push(s.clone());}
    }
    Ok((if parts.is_empty(){String::new()}else{format!(" ORDER BY {}",parts.join(", "))},normalized))
}

async fn catalog(c:&Connection,max:usize)->Result<Value,String>{
    if !is_pg(&c.engine)&&!is_mssql(&c.engine){
        let sql="SELECT s.SCHEMA_NAME AS databaseName,s.DEFAULT_CHARACTER_SET_NAME AS defaultCharset,s.DEFAULT_COLLATION_NAME AS defaultCollation,t.TABLE_NAME AS tableName,t.TABLE_TYPE AS tableType,t.ENGINE AS engine,t.ROW_FORMAT AS rowFormat,t.TABLE_ROWS AS tableRows,t.AVG_ROW_LENGTH AS avgRowLength,t.DATA_LENGTH AS dataLength,t.INDEX_LENGTH AS indexLength,t.DATA_FREE AS dataFree,t.AUTO_INCREMENT AS autoIncrement,t.CREATE_TIME AS createTime,t.UPDATE_TIME AS updateTime,t.TABLE_COLLATION AS tableCollation,t.TABLE_COMMENT AS tableComment,(SELECT COUNT(*) FROM information_schema.COLUMNS c WHERE c.TABLE_SCHEMA=t.TABLE_SCHEMA AND c.TABLE_NAME=t.TABLE_NAME) AS columnCount,(SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS i WHERE i.TABLE_SCHEMA=t.TABLE_SCHEMA AND i.TABLE_NAME=t.TABLE_NAME) AS indexCount,(SELECT COUNT(DISTINCT CONSTRAINT_NAME) FROM information_schema.KEY_COLUMN_USAGE k WHERE k.TABLE_SCHEMA=t.TABLE_SCHEMA AND k.TABLE_NAME=t.TABLE_NAME AND k.REFERENCED_TABLE_NAME IS NOT NULL) AS foreignKeyCount FROM information_schema.SCHEMATA s LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA=s.SCHEMA_NAME ORDER BY s.SCHEMA_NAME,t.TABLE_NAME";
        let r=execute_sql(c,sql,None,max).await?; let mut map=std::collections::BTreeMap::<String,Value>::new();
        for row in rows_of(&r){let Some(o)=row.as_object()else{continue};let name=o.get("databaseName").and_then(Value::as_str).unwrap_or("").to_string();if ["information_schema","performance_schema","mysql","sys"].contains(&name.as_str())||name.is_empty(){continue}let db=map.entry(name.clone()).or_insert_with(||json!({"name":name,"defaultCharset":o.get("defaultCharset"),"defaultCollation":o.get("defaultCollation"),"tableCount":0,"totalRows":0,"dataSizeMB":"0.00","indexSizeMB":"0.00","totalSizeMB":"0.00","tables":[],"tableDetails":[]}));if o.get("tableName").and_then(Value::as_str).is_none(){continue}let detail=json!({"tableName":o.get("tableName"),"tableType":o.get("tableType"),"comment":o.get("tableComment"),"rows":num(o.get("tableRows")),"columns":num(o.get("columnCount")),"sizeMB":format!("{:.2}",(num(o.get("dataLength"))+num(o.get("indexLength")))as f64/1048576.0),"dataSizeMB":format!("{:.2}",num(o.get("dataLength"))as f64/1048576.0),"indexSizeMB":format!("{:.2}",num(o.get("indexLength"))as f64/1048576.0),"freeSizeMB":format!("{:.2}",num(o.get("dataFree"))as f64/1048576.0),"avgRowLength":num(o.get("avgRowLength")),"createdAt":o.get("createTime"),"updatedAt":o.get("updateTime"),"engine":o.get("engine"),"rowFormat":o.get("rowFormat"),"collation":o.get("tableCollation"),"autoIncrement":o.get("autoIncrement"),"indexCount":num(o.get("indexCount")),"foreignKeyCount":num(o.get("foreignKeyCount"))});let d=db.as_object_mut().unwrap();d.get_mut("tables").unwrap().as_array_mut().unwrap().push(o.get("tableName").cloned().unwrap_or(Value::Null));d.get_mut("tableDetails").unwrap().as_array_mut().unwrap().push(detail);*d.get_mut("tableCount").unwrap()=json!(d["tableCount"].as_u64().unwrap_or(0)+1);*d.get_mut("totalRows").unwrap()=json!(d["totalRows"].as_u64().unwrap_or(0)+num(o.get("tableRows")));}
        return Ok(json!({"databases":map.into_values().collect::<Vec<_>>(),"_meta":{"statements":[{"label":"Ayrıntılı katalog","sql":sql}]}}))
    }
    let db_sql=if is_pg(&c.engine){"SELECT datname AS name FROM pg_database WHERE datistemplate=false AND datallowconn=true ORDER BY datname"}else{"SELECT name FROM sys.databases WHERE state_desc='ONLINE' AND database_id>4 ORDER BY name"};
    let dbs=rows_of(&execute_sql(c,db_sql,None,max).await?);let mut out=Vec::new();
    for row in dbs{let Some(name)=row.get("name").and_then(Value::as_str)else{continue};let table_sql=if is_pg(&c.engine){"SELECT table_name AS tableName,table_type AS tableType FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"}else{"SELECT t.name AS tableName,'BASE TABLE' AS tableType FROM sys.tables t ORDER BY t.name"};let tables=execute_sql(c,table_sql,Some(name),max).await.ok().map(|x|rows_of(&x)).unwrap_or_default();let names=tables.iter().filter_map(|x|x.get("tableName").cloned()).collect::<Vec<_>>();let details=tables.iter().map(|x|json!({"tableName":x.get("tableName"),"tableType":x.get("tableType"),"comment":"","rows":0,"columns":0,"sizeMB":"0.00","dataSizeMB":"0.00","indexSizeMB":"0.00","freeSizeMB":"0.00","avgRowLength":0,"createdAt":null,"updatedAt":null,"engine":c.engine,"rowFormat":null,"collation":null,"autoIncrement":null,"indexCount":0,"foreignKeyCount":0})).collect::<Vec<_>>();out.push(json!({"name":name,"defaultCharset":null,"defaultCollation":null,"tableCount":names.len(),"totalRows":0,"dataSizeMB":"0.00","indexSizeMB":"0.00","totalSizeMB":"0.00","tables":names,"tableDetails":details}));}
    Ok(json!({"databases":out,"_meta":{"statements":[{"label":"Katalog","sql":db_sql}]}}))
}

async fn table_data(c:&Connection,p:&Map<String,Value>,max_page:usize)->Result<Value,String>{
    let db=payload_str(p,"database")?;let table=payload_str(p,"table")?;let page=p.get("page").and_then(Value::as_u64).unwrap_or(1).max(1);let size=p.get("pageSize").and_then(Value::as_u64).unwrap_or(50).clamp(10,max_page as u64);
    let (where_sql,filters)=build_filters(p,&c.engine)?;let (sort_sql,sorts)=build_sorts(p,&c.engine)?;let qt=qualified(db,table,&c.engine)?;
    let known=p.get("knownTotalRows").and_then(Value::as_u64);let count=p.get("includeTotal").and_then(Value::as_bool).unwrap_or(true)||known.is_none();let total=if count{let rr=execute_sql(c,&format!("SELECT COUNT(*) AS totalRows FROM {}{}",qt,where_sql),Some(db),1).await?;rows_of(&rr).first().and_then(|x|x.get("totalRows")).map(|x|num(Some(x))).unwrap_or(0)}else{known.unwrap_or(0)};
    let pages=((total+size-1)/size).max(1);let current=page.min(pages);let offset=(current-1)*size;
    let data_sql=if is_mssql(&c.engine){format!("SELECT * FROM {}{}{}{} OFFSET {} ROWS FETCH NEXT {} ROWS ONLY",qt,where_sql,if sort_sql.is_empty(){" ORDER BY (SELECT NULL)"}else{&sort_sql},"",offset,size)}else{format!("SELECT * FROM {}{}{} LIMIT {} OFFSET {}",qt,where_sql,sort_sql,size,offset)};
    let data=rows_of(&execute_sql(c,&data_sql,Some(db),size as usize).await?);
    Ok(json!({"data":data,"pagination":{"page":current,"pageSize":size,"totalRows":total,"totalPages":pages,"hasPreviousPage":current>1,"hasNextPage":current<pages},"sorts":sorts,"filters":filters,"_meta":{"statements":[{"label":"Tablo satırları","sql":data_sql}]}}))
}

async fn table_info(c:&Connection,p:&Map<String,Value>,max:usize)->Result<Value,String>{
    let db=payload_str(p,"database")?;let table=payload_str(p,"table")?;
    if !is_pg(&c.engine)&&!is_mssql(&c.engine){
        let escdb=db.replace("'","''");let esct=table.replace("'","''");
        let cols=format!("SELECT COLUMN_NAME AS Field,COLUMN_TYPE AS Type,IS_NULLABLE AS `Null`,COLUMN_KEY AS `Key`,COLUMN_DEFAULT AS `Default`,EXTRA AS Extra,COLUMN_COMMENT AS Comment,COLLATION_NAME AS Collation,ORDINAL_POSITION AS Ordinal_position,DATA_TYPE AS Data_type,CHARACTER_MAXIMUM_LENGTH AS Character_maximum_length,NUMERIC_PRECISION AS Numeric_precision,NUMERIC_SCALE AS Numeric_scale,DATETIME_PRECISION AS Datetime_precision,CHARACTER_SET_NAME AS Character_set_name,GENERATION_EXPRESSION AS Generation_expression FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='{}' AND TABLE_NAME='{}' ORDER BY ORDINAL_POSITION",escdb,esct);
        let idx=format!("SELECT INDEX_NAME AS Key_name,COLUMN_NAME AS Column_name,NON_UNIQUE AS Non_unique,SEQ_IN_INDEX AS Seq_in_index,INDEX_TYPE AS Index_type,COLLATION AS Collation,CARDINALITY AS Cardinality,SUB_PART AS Sub_part,NULLABLE AS Nullable,INDEX_COMMENT AS Index_comment,'YES' AS Is_visible,NULL AS Expression FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='{}' AND TABLE_NAME='{}' ORDER BY INDEX_NAME,SEQ_IN_INDEX",escdb,esct);
        let fks=format!("SELECT CONSTRAINT_NAME,COLUMN_NAME,ORDINAL_POSITION,REFERENCED_TABLE_SCHEMA,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='{}' AND TABLE_NAME='{}' AND REFERENCED_TABLE_NAME IS NOT NULL",escdb,esct);
        let create=format!("SHOW CREATE TABLE {}",qualified(db,table,&c.engine)?);let columns=rows_of(&execute_sql(c,&cols,Some(db),max).await?);let indexes=rows_of(&execute_sql(c,&idx,Some(db),max).await.unwrap_or(json!({"rows":[]})));let foreign=rows_of(&execute_sql(c,&fks,Some(db),max).await.unwrap_or(json!({"rows":[]})));let cr=rows_of(&execute_sql(c,&create,Some(db),1).await.unwrap_or(json!({"rows":[]})));let create_sql=cr.first().and_then(Value::as_object).and_then(|o|o.values().last()).and_then(Value::as_str).unwrap_or("").to_string();
        return Ok(json!({"table":{"name":table,"comment":"","engine":c.engine,"collation":null,"charset":null,"autoIncrement":null,"rowFormat":null,"tableType":"BASE TABLE","createTime":null,"updateTime":null},"columns":columns,"indexes":indexes,"foreignKeys":foreign,"checkConstraints":[],"partitions":[],"createSQL":create_sql,"_meta":{"statements":[{"label":"Tablo yapısı","sql":cols}]}}))
    }
    let esc=table.replace("'","''");
    let (sql,index_sql,fk_sql)=if is_pg(&c.engine){
      (
       format!("SELECT column_name AS \"Field\",data_type AS \"Type\",is_nullable AS \"Null\",'' AS \"Key\",column_default AS \"Default\",'' AS \"Extra\",'' AS \"Comment\",NULL AS \"Collation\",ordinal_position AS \"Ordinal_position\",data_type AS \"Data_type\",character_maximum_length AS \"Character_maximum_length\",numeric_precision AS \"Numeric_precision\",numeric_scale AS \"Numeric_scale\",datetime_precision AS \"Datetime_precision\",NULL AS \"Character_set_name\",'' AS \"Generation_expression\" FROM information_schema.columns WHERE table_schema='public' AND table_name='{}' ORDER BY ordinal_position",esc),
       format!("SELECT ic.relname AS \"Key_name\",a.attname AS \"Column_name\",CASE WHEN ix.indisunique THEN '0' ELSE '1' END AS \"Non_unique\",ord.ordinality::text AS \"Seq_in_index\",am.amname AS \"Index_type\",NULL AS \"Collation\",NULL AS \"Cardinality\",NULL AS \"Sub_part\",'' AS \"Nullable\",'' AS \"Index_comment\",'YES' AS \"Is_visible\",NULL AS \"Expression\" FROM pg_class tc JOIN pg_namespace ns ON ns.oid=tc.relnamespace JOIN pg_index ix ON tc.oid=ix.indrelid JOIN pg_class ic ON ic.oid=ix.indexrelid JOIN pg_am am ON am.oid=ic.relam CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY ord(attnum,ordinality) JOIN pg_attribute a ON a.attrelid=tc.oid AND a.attnum=ord.attnum WHERE ns.nspname='public' AND tc.relname='{}' ORDER BY ic.relname,ord.ordinality",esc),
       format!("SELECT tc.constraint_name AS \"CONSTRAINT_NAME\",kcu.column_name AS \"COLUMN_NAME\",kcu.ordinal_position AS \"ORDINAL_POSITION\",ccu.table_schema AS \"REFERENCED_TABLE_SCHEMA\",ccu.table_name AS \"REFERENCED_TABLE_NAME\",ccu.column_name AS \"REFERENCED_COLUMN_NAME\",rc.update_rule AS \"UPDATE_RULE\",rc.delete_rule AS \"DELETE_RULE\" FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema JOIN information_schema.referential_constraints rc ON rc.constraint_name=tc.constraint_name AND rc.constraint_schema=tc.constraint_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' AND tc.table_name='{}' ORDER BY tc.constraint_name,kcu.ordinal_position",esc)
      )
    }else{
      (
       format!("SELECT c.name AS Field,TYPE_NAME(c.user_type_id) AS Type,CASE WHEN c.is_nullable=1 THEN 'YES' ELSE 'NO' END AS [Null],'' AS [Key],OBJECT_DEFINITION(c.default_object_id) AS [Default],CASE WHEN c.is_identity=1 THEN 'identity' ELSE '' END AS Extra,'' AS Comment,NULL AS Collation,c.column_id AS Ordinal_position,TYPE_NAME(c.user_type_id) AS Data_type,c.max_length AS Character_maximum_length,c.precision AS Numeric_precision,c.scale AS Numeric_scale,NULL AS Datetime_precision,NULL AS Character_set_name,'' AS Generation_expression FROM sys.columns c WHERE c.object_id=OBJECT_ID(N'dbo.{}') ORDER BY c.column_id",esc),
       format!("SELECT i.name AS Key_name,c.name AS Column_name,CASE WHEN i.is_unique=1 THEN '0' ELSE '1' END AS Non_unique,ic.key_ordinal AS Seq_in_index,i.type_desc AS Index_type,NULL AS Collation,NULL AS Cardinality,NULL AS Sub_part,'' AS Nullable,'' AS Index_comment,CASE WHEN i.is_disabled=0 THEN 'YES' ELSE 'NO' END AS Is_visible,NULL AS Expression FROM sys.indexes i JOIN sys.index_columns ic ON i.object_id=ic.object_id AND i.index_id=ic.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id WHERE i.object_id=OBJECT_ID(N'dbo.{}') AND i.name IS NOT NULL ORDER BY i.name,ic.key_ordinal",esc),
       format!("SELECT fk.name AS CONSTRAINT_NAME,pc.name AS COLUMN_NAME,fkc.constraint_column_id AS ORDINAL_POSITION,DB_NAME() AS REFERENCED_TABLE_SCHEMA,rt.name AS REFERENCED_TABLE_NAME,rc.name AS REFERENCED_COLUMN_NAME,fk.update_referential_action_desc AS UPDATE_RULE,fk.delete_referential_action_desc AS DELETE_RULE FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fk.object_id=fkc.constraint_object_id JOIN sys.tables pt ON pt.object_id=fk.parent_object_id JOIN sys.columns pc ON pc.object_id=pt.object_id AND pc.column_id=fkc.parent_column_id JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fkc.referenced_column_id WHERE pt.object_id=OBJECT_ID(N'dbo.{}') ORDER BY fk.name,fkc.constraint_column_id",esc)
      )
    };
    let columns=rows_of(&execute_sql(c,&sql,Some(db),max).await?);
    let indexes=rows_of(&execute_sql(c,&index_sql,Some(db),max).await.unwrap_or(json!({"rows":[]})));
    let foreign_keys=rows_of(&execute_sql(c,&fk_sql,Some(db),max).await.unwrap_or(json!({"rows":[]})));
    Ok(json!({"table":{"name":table,"comment":"","engine":c.engine,"collation":null,"charset":null,"autoIncrement":null,"rowFormat":null,"tableType":"BASE TABLE","createTime":null,"updateTime":null},"columns":columns,"indexes":indexes,"foreignKeys":foreign_keys,"checkConstraints":[],"partitions":[],"createSQL":"","_meta":{"statements":[{"label":"Tablo yapısı","sql":sql},{"label":"İndeksler","sql":index_sql},{"label":"Foreign key","sql":fk_sql}]}}))
}

async fn update_cell(c:&Connection,p:&Map<String,Value>)->Result<Value,String>{
    if c.read_only{return Err("Bu bağlantı salt okunur modda.".into())}let db=payload_str(p,"database")?;let table=payload_str(p,"table")?;let col=payload_str(p,"column")?;let pk=p.get("primaryKey").and_then(Value::as_object).ok_or("Primary key eksik.")?;if pk.is_empty(){return Err("Primary key boş.".into())}let value=p.get("value").cloned().unwrap_or(Value::Null);let where_sql=pk.iter().map(|(k,v)|Ok(format!("{}={}",ident(k,&c.engine)?,literal(v,&c.engine)))).collect::<Result<Vec<_>,String>>()?.join(" AND ");let sql=format!("UPDATE {} SET {}={} WHERE {}",qualified(db,table,&c.engine)?,ident(col,&c.engine)?,literal(&value,&c.engine),where_sql);let r=execute_sql(c,&sql,Some(db),1).await?;Ok(json!({"affectedRows":r["affectedRows"],"value":value,"_meta":{"statements":[{"label":"Hücre güncelleme","sql":sql}]}}))
}
async fn delete_rows(c:&Connection,p:&Map<String,Value>)->Result<Value,String>{
    if c.read_only{return Err("Bu bağlantı salt okunur modda.".into())}let db=payload_str(p,"database")?;let table=payload_str(p,"table")?;let pks=p.get("primaryKeys").and_then(Value::as_array).ok_or("Primary key listesi eksik.")?;let mut cs=Vec::new();for v in pks{if let Some(pk)=v.as_object(){if pk.is_empty(){continue}cs.push(format!("({})",pk.iter().map(|(k,v)|Ok(format!("{}={}",ident(k,&c.engine)?,literal(v,&c.engine)))).collect::<Result<Vec<_>,String>>()?.join(" AND ")));}}if cs.is_empty(){return Err("Silinecek satır yok.".into())}let sql=format!("DELETE FROM {} WHERE {}",qualified(db,table,&c.engine)?,cs.join(" OR "));let r=execute_sql(c,&sql,Some(db),1).await?;Ok(json!({"affectedRows":r["affectedRows"],"_meta":{"statements":[{"label":"Satır silme","sql":sql}]}}))
}

fn column_def(v:&Value,engine:&str)->Result<String,String>{let o=v.as_object().ok_or("Kolon tanımı geçersiz.")?;let name=o.get("name").and_then(Value::as_str).ok_or("Kolon adı eksik.")?;let dt=o.get("dataType").and_then(Value::as_str).unwrap_or("VARCHAR").to_ascii_uppercase();if !dt.chars().all(|x|x.is_ascii_alphanumeric()||x=='_'||x==' '){return Err("Veri tipi geçersiz.".into())}let len=o.get("length").and_then(Value::as_str).unwrap_or("");let mut s=format!("{} {}{}",ident(name,engine)?,dt,if len.is_empty(){String::new()}else{format!("({})",len.chars().filter(|x|x.is_ascii_digit()||*x==',').collect::<String>())});if o.get("nullable").and_then(Value::as_bool).unwrap_or(false){s.push_str(" NULL")}else{s.push_str(" NOT NULL")}if let Some(kind)=o.get("defaultKind").and_then(Value::as_str){match kind{"null"=>s.push_str(" DEFAULT NULL"),"literal"=>s.push_str(&format!(" DEFAULT {}",literal(&o.get("defaultValue").cloned().unwrap_or(Value::String(String::new())),engine))),"expression"=>{if let Some(x)=o.get("defaultValue").and_then(Value::as_str){s.push_str(&format!(" DEFAULT {}",x))}},_=>{}}}if o.get("autoIncrement").and_then(Value::as_bool).unwrap_or(false){if !is_pg(engine)&&!is_mssql(engine){s.push_str(" AUTO_INCREMENT")}}Ok(s)}
async fn alter_table(c:&Connection,p:&Map<String,Value>,max:usize)->Result<Value,String>{
    if c.read_only{return Err("Bu bağlantı salt okunur modda.".into())}let db=payload_str(p,"database")?;let mut table=payload_str(p,"table")?.to_string();let m=p.get("mutation").and_then(Value::as_object).ok_or("Mutation eksik.")?;let kind=m.get("kind").and_then(Value::as_str).ok_or("Mutation türü eksik.")?;let qt=qualified(db,&table,&c.engine)?;
    let sql=match kind{
      "table-options"=>{if let Some(n)=m.get("name").and_then(Value::as_str){if !n.trim().is_empty()&&n!=table{let s=if is_mssql(&c.engine){format!("EXEC sp_rename N'dbo.{}', N'{}'",table.replace("'","''"),n.replace("'","''"))}else{format!("ALTER TABLE {} RENAME TO {}",qt,ident(n,&c.engine)?)};execute_sql(c,&s,Some(db),1).await?;table=n.to_string();}}
        if !is_pg(&c.engine)&&!is_mssql(&c.engine){let mut opts=Vec::new();if let Some(engine)=m.get("engine").and_then(Value::as_str){let e=engine.to_ascii_uppercase();if !["INNODB","MYISAM","MEMORY","ARIA"].contains(&e.as_str()){return Err("Desteklenmeyen tablo motoru.".into())}opts.push(format!("ENGINE={}",e));}if let Some(collation)=m.get("collation").and_then(Value::as_str){if !collation.chars().all(|x|x.is_ascii_alphanumeric()||x=='_'){return Err("Collation geçersiz.".into())}opts.push(format!("DEFAULT COLLATE={}",collation));}if let Some(ai)=m.get("autoIncrement").and_then(Value::as_u64){opts.push(format!("AUTO_INCREMENT={}",ai.max(1)));}if let Some(row)=m.get("rowFormat").and_then(Value::as_str){let rf=row.to_ascii_uppercase();if !["DEFAULT","DYNAMIC","COMPACT","REDUNDANT","COMPRESSED","FIXED"].contains(&rf.as_str()){return Err("Satır formatı geçersiz.".into())}opts.push(format!("ROW_FORMAT={}",rf));}if let Some(comment)=m.get("comment").and_then(Value::as_str){opts.push(format!("COMMENT={}",literal(&json!(comment),&c.engine)));}if opts.is_empty(){String::new()}else{format!("ALTER TABLE {} {}",qualified(db,&table,&c.engine)?,opts.join(", "))}}
        else if let Some(comment)=m.get("comment").and_then(Value::as_str){if is_pg(&c.engine){format!("COMMENT ON TABLE {} IS {}",qualified(db,&table,&c.engine)?,literal(&json!(comment),&c.engine))}else{String::new()}}else{String::new()}},
      "add-column"=>format!("ALTER TABLE {} ADD COLUMN {}",qt,column_def(m.get("column").ok_or("Kolon eksik.")?,&c.engine)?),
      "modify-column"=>{let old=m.get("originalName").and_then(Value::as_str).ok_or("Eski kolon adı eksik.")?;if is_pg(&c.engine){let co=m.get("column").and_then(Value::as_object).ok_or("Kolon eksik.")?;let typ=co.get("dataType").and_then(Value::as_str).unwrap_or("TEXT");format!("ALTER TABLE {} ALTER COLUMN {} TYPE {}",qt,ident(old,&c.engine)?,typ)}else if is_mssql(&c.engine){format!("ALTER TABLE {} ALTER COLUMN {}",qt,column_def(m.get("column").ok_or("Kolon eksik.")?,&c.engine)?)}else{format!("ALTER TABLE {} CHANGE COLUMN {} {}",qt,ident(old,&c.engine)?,column_def(m.get("column").ok_or("Kolon eksik.")?,&c.engine)?)}},
      "drop-column"=>format!("ALTER TABLE {} DROP COLUMN {}",qt,ident(m.get("columnName").and_then(Value::as_str).ok_or("Kolon adı eksik.")?,&c.engine)?),
      "drop-index"=>{let n=m.get("indexName").and_then(Value::as_str).ok_or("İndeks adı eksik.")?;if !is_pg(&c.engine)&&!is_mssql(&c.engine)&&n=="PRIMARY"{format!("ALTER TABLE {} DROP PRIMARY KEY",qt)}else if is_pg(&c.engine){format!("DROP INDEX IF EXISTS {}",ident(n,&c.engine)?)}else if is_mssql(&c.engine){format!("DROP INDEX {} ON {}",ident(n,&c.engine)?,qt)}else{format!("ALTER TABLE {} DROP INDEX {}",qt,ident(n,&c.engine)?)}},
      "drop-foreign-key"=>{let n=m.get("constraintName").and_then(Value::as_str).ok_or("Constraint adı eksik.")?;if !is_pg(&c.engine)&&!is_mssql(&c.engine){format!("ALTER TABLE {} DROP FOREIGN KEY {}",qt,ident(n,&c.engine)?)}else{format!("ALTER TABLE {} DROP CONSTRAINT {}",qt,ident(n,&c.engine)?)}},
      "add-index"=>{let ix=m.get("index").and_then(Value::as_object).ok_or("İndeks eksik.")?;let columns=ix.get("columns").and_then(Value::as_array).ok_or("İndeks kolonu eksik.")?;if columns.is_empty(){return Err("İndeks en az bir kolon içermelidir.".into())}let cols=columns.iter().filter_map(Value::as_object).map(|o|{let name=o.get("name").and_then(Value::as_str).ok_or("İndeks kolon adı eksik.")?;let mut q=ident(name,&c.engine)?;if !is_pg(&c.engine)&&!is_mssql(&c.engine){if let Some(len)=o.get("length").and_then(Value::as_u64){q.push_str(&format!("({})",len.clamp(1,65535)));}if o.get("order").and_then(Value::as_str)==Some("DESC"){q.push_str(" DESC");}}Ok(q)}).collect::<Result<Vec<_>,String>>()?.join(", ");let kind=ix.get("kind").and_then(Value::as_str).unwrap_or("INDEX");let name=ix.get("name").and_then(Value::as_str).unwrap_or("idx_coreor");if kind=="PRIMARY"{format!("ALTER TABLE {} ADD PRIMARY KEY ({})",qt,cols)}else if !is_pg(&c.engine)&&!is_mssql(&c.engine)&&kind=="FULLTEXT"{format!("ALTER TABLE {} ADD FULLTEXT KEY {} ({})",qt,ident(name,&c.engine)?,cols)}else if !is_pg(&c.engine)&&!is_mssql(&c.engine)&&kind=="SPATIAL"{format!("ALTER TABLE {} ADD SPATIAL INDEX {} ({})",qt,ident(name,&c.engine)?,cols)}else{format!("CREATE {} INDEX {} ON {} ({})",if kind=="UNIQUE"{"UNIQUE"}else{""},ident(name,&c.engine)?,qt,cols)}},
      "add-foreign-key"=>{let fk=m.get("foreignKey").and_then(Value::as_object).ok_or("Foreign key eksik.")?;let name=fk.get("name").and_then(Value::as_str).ok_or("FK adı eksik.")?;let lc=fk.get("columns").and_then(Value::as_array).ok_or("FK kolonları eksik.")?.iter().filter_map(Value::as_str).map(|x|ident(x,&c.engine)).collect::<Result<Vec<_>,_>>()?.join(",");let rt=fk.get("referencedTable").and_then(Value::as_str).ok_or("Referans tablo eksik.")?;let rc=fk.get("referencedColumns").and_then(Value::as_array).ok_or("Referans kolon eksik.")?.iter().filter_map(Value::as_str).map(|x|ident(x,&c.engine)).collect::<Result<Vec<_>,_>>()?.join(",");format!("ALTER TABLE {} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({})",qt,ident(name,&c.engine)?,lc,qualified(db,rt,&c.engine)?,rc)},
      _=>return Err("Desteklenmeyen tablo değişikliği.".into())
    };if !sql.is_empty(){execute_sql(c,&sql,Some(db),1).await?}let mut np=p.clone();np.insert("table".into(),json!(table));let info=table_info(c,&np,max).await?;Ok(json!({"tableName":table,"tableInfo":info,"_meta":{"statements":[{"label":"Şema değişikliği","sql":sql}]}}))
}

async fn workbench(c:&Connection,action:&str,p:&Map<String,Value>,max:usize)->Result<Value,String>{
 match action{
 "process-list"=>{
   let sql=if is_pg(&c.engine){"SELECT pid AS id,usename AS user,COALESCE(client_addr::text,'') AS host,datname AS database,state AS command,EXTRACT(EPOCH FROM(now()-query_start))::bigint AS seconds,wait_event AS state,query AS info FROM pg_stat_activity ORDER BY query_start NULLS LAST"}else if is_mssql(&c.engine){"SELECT r.session_id AS id,s.login_name AS [user],s.host_name AS host,DB_NAME(r.database_id) AS [database],r.command,DATEDIFF(SECOND,r.start_time,SYSDATETIME()) AS seconds,r.status AS state,t.text AS info FROM sys.dm_exec_requests r JOIN sys.dm_exec_sessions s ON s.session_id=r.session_id CROSS APPLY sys.dm_exec_sql_text(r.sql_handle)t"}else{"SELECT ID AS id,USER AS user,HOST AS host,DB AS database,COMMAND AS command,TIME AS seconds,STATE AS state,INFO AS info FROM information_schema.PROCESSLIST ORDER BY TIME DESC"};
   let processes=rows_of(&execute_sql(c,sql,None,max).await?);
   if !is_pg(&c.engine)&&!is_mssql(&c.engine){
     let current=rows_of(&execute_sql(c,"SELECT CONNECTION_ID() AS currentConnectionId",None,1).await.unwrap_or(json!({"rows":[]}))).first().and_then(|x|x.get("currentConnectionId")).map(|x|num(Some(x)));
     let lock_sql="SELECT ml.OBJECT_TYPE AS objectType,ml.OBJECT_SCHEMA AS schema,ml.OBJECT_NAME AS objectName,ml.LOCK_TYPE AS lockType,ml.LOCK_DURATION AS lockDuration,ml.LOCK_STATUS AS lockStatus,ml.OWNER_THREAD_ID AS ownerThreadId,th.PROCESSLIST_ID AS processId FROM performance_schema.metadata_locks ml LEFT JOIN performance_schema.threads th ON th.THREAD_ID=ml.OWNER_THREAD_ID ORDER BY ml.LOCK_STATUS DESC,ml.OBJECT_SCHEMA,ml.OBJECT_NAME";
     let locks=rows_of(&execute_sql(c,lock_sql,None,max).await.unwrap_or(json!({"rows":[]})));
     let innodb=rows_of(&execute_sql(c,"SHOW ENGINE INNODB STATUS",None,1).await.unwrap_or(json!({"rows":[]})));
     let status=innodb.first().and_then(Value::as_object).and_then(|o|o.get("Status").or_else(||o.get("STATUS"))).and_then(Value::as_str).unwrap_or("");
     let marker="LATEST DETECTED DEADLOCK";let deadlock=status.find(marker).map(|i|status[i..std::cmp::min(status.len(),i+12000)].to_string());
     return Ok(json!({"processes":processes,"locks":locks,"deadlockText":deadlock,"currentConnectionId":current}));
   }
   let locks=if is_pg(&c.engine){
      let lock_sql="SELECT l.locktype AS \"objectType\",n.nspname AS \"schema\",c.relname AS \"objectName\",l.mode AS \"lockType\",NULL AS \"lockDuration\",CASE WHEN l.granted THEN 'GRANTED' ELSE 'WAITING' END AS \"lockStatus\",l.pid AS \"ownerThreadId\",l.pid AS \"processId\" FROM pg_locks l LEFT JOIN pg_class c ON c.oid=l.relation LEFT JOIN pg_namespace n ON n.oid=c.relnamespace ORDER BY l.granted,n.nspname,c.relname";
      rows_of(&execute_sql(c,lock_sql,None,max).await.unwrap_or(json!({"rows":[]})))
   }else{
      let lock_sql="SELECT request_type AS objectType,DB_NAME(resource_database_id) AS [schema],OBJECT_NAME(resource_associated_entity_id,resource_database_id) AS objectName,request_mode AS lockType,request_owner_type AS lockDuration,request_status AS lockStatus,request_session_id AS ownerThreadId,request_session_id AS processId FROM sys.dm_tran_locks ORDER BY request_status,request_session_id";
      rows_of(&execute_sql(c,lock_sql,None,max).await.unwrap_or(json!({"rows":[]})))
   };
   Ok(json!({"processes":processes,"locks":locks,"deadlockText":null,"currentConnectionId":null}))
 },
 "process-kill"=>{if c.read_only{return Err("Salt okunur profil process sonlandıramaz.".into())}let id=p.get("processId").and_then(Value::as_u64).ok_or("Process ID eksik.")?;let sql=if is_pg(&c.engine){format!("SELECT pg_terminate_backend({})",id)}else if is_mssql(&c.engine){format!("KILL {}",id)}else{format!("KILL {} {}",if p.get("killType").and_then(Value::as_str)==Some("query"){"QUERY"}else{"CONNECTION"},id)};execute_sql(c,&sql,None,1).await?;Ok(json!({"killed":true,"processId":id}))},
 "users-list"=>{let sql=if is_pg(&c.engine){"SELECT rolname AS user,'' AS host,NULL AS plugin,false AS \"accountLocked\",false AS \"passwordExpired\",NULL AS \"passwordLastChanged\",NOT rolcanlogin AS \"isRole\" FROM pg_roles ORDER BY rolname"}else if is_mssql(&c.engine){"SELECT name AS [user],'' AS host,type_desc AS plugin,is_disabled AS accountLocked,0 AS passwordExpired,NULL AS passwordLastChanged,CASE WHEN type='R' THEN 1 ELSE 0 END AS isRole FROM sys.server_principals WHERE type IN('S','U','G','R') ORDER BY name"}else{"SELECT User AS user,Host AS host,plugin,account_locked AS accountLocked,password_expired AS passwordExpired,password_last_changed AS passwordLastChanged,0 AS isRole FROM mysql.user ORDER BY User,Host"};let rr=rows_of(&execute_sql(c,sql,None,max).await?);let mut users=Vec::new();let mut roles=Vec::new();for x in rr{if x.get("isRole").and_then(Value::as_bool).unwrap_or(false)||x.get("isRole").and_then(Value::as_i64).unwrap_or(0)!=0{roles.push(x)}else{users.push(x)}}Ok(json!({"users":users,"roles":roles,"assignments":[]}))},
 "user-grants"=>{let u=payload_str(p,"user")?;let h=p.get("host").and_then(Value::as_str).unwrap_or("%");let sql=if is_pg(&c.engine){format!("SELECT rolname AS grant FROM pg_roles WHERE rolname={}",literal(&json!(u),&c.engine))}else if is_mssql(&c.engine){format!("SELECT permission_name AS [grant] FROM sys.server_permissions p JOIN sys.server_principals sp ON p.grantee_principal_id=sp.principal_id WHERE sp.name={}",literal(&json!(u),&c.engine))}else{format!("SHOW GRANTS FOR {}@{}",literal(&json!(u),&c.engine),literal(&json!(h),&c.engine))};let rr=rows_of(&execute_sql(c,&sql,None,max).await?);let grants=rr.iter().flat_map(|x|x.as_object().into_iter().flat_map(|o|o.values())).map(|x|x.as_str().map(ToOwned::to_owned).unwrap_or_else(||x.to_string())).collect::<Vec<_>>();Ok(json!({"grants":grants}))},
 "user-drop"=>{if c.read_only{return Err("Salt okunur.".into())}let u=payload_str(p,"user")?;let h=p.get("host").and_then(Value::as_str).unwrap_or("%");let sql=if is_pg(&c.engine){format!("DROP ROLE IF EXISTS {}",ident(u,&c.engine)?)}else if is_mssql(&c.engine){format!("DROP LOGIN {}",ident(u,&c.engine)?)}else{format!("DROP USER IF EXISTS {}@{}",literal(&json!(u),&c.engine),literal(&json!(h),&c.engine))};execute_sql(c,&sql,None,1).await?;Ok(json!({"dropped":true}))},
 "role-create"=>{if c.read_only{return Err("Salt okunur.".into())}let role=payload_str(p,"role")?;let sql=if is_pg(&c.engine){format!("CREATE ROLE {}",ident(role,&c.engine)?)}else if is_mssql(&c.engine){format!("CREATE SERVER ROLE {}",ident(role,&c.engine)?)}else if c.engine=="mariadb"{format!("CREATE ROLE IF NOT EXISTS {}",ident(role,&c.engine)?)}else{format!("CREATE ROLE IF NOT EXISTS {}@{}",literal(&json!(role),&c.engine),literal(&json!("%"),&c.engine))};execute_sql(c,&sql,None,1).await?;Ok(json!({"created":true}))},
 "role-assign"=>{if c.read_only{return Err("Salt okunur.".into())}let role=payload_str(p,"role")?;let user=payload_str(p,"user")?;let revoke=p.get("mode").and_then(Value::as_str)==Some("revoke");let sql=if is_pg(&c.engine){format!("{} {} {}",if revoke{"REVOKE"}else{"GRANT"},ident(role,&c.engine)?,if revoke{format!("FROM {}",ident(user,&c.engine)?)}else{format!("TO {}",ident(user,&c.engine)?)})}else if is_mssql(&c.engine){format!("ALTER SERVER ROLE {} {} MEMBER {}",ident(role,&c.engine)?,if revoke{"DROP"}else{"ADD"},ident(user,&c.engine)?)}else{format!("{} {} TO {}@{}",if revoke{"REVOKE"}else{"GRANT"},ident(role,&c.engine)?,literal(&json!(user),&c.engine),literal(&json!(p.get("host").and_then(Value::as_str).unwrap_or("%")),&c.engine))};execute_sql(c,&sql,None,1).await?;Ok(json!({"changed":true}))},
 "import-data"=>{if c.read_only{return Err("Salt okunur.".into())}let inp=p.get("importInput").and_then(Value::as_object).ok_or("Import bilgisi eksik.")?;let db=payload_str(inp,"database")?;let table=payload_str(inp,"table")?;let cols=inp.get("columns").and_then(Value::as_array).ok_or("Kolonlar eksik.")?;let rows=inp.get("rows").and_then(Value::as_array).ok_or("Satırlar eksik.")?;if cols.is_empty()||rows.is_empty(){return Err("Import verisi boş.".into())}let cs=cols.iter().filter_map(Value::as_str).map(|x|ident(x,&c.engine)).collect::<Result<Vec<_>,_>>()?.join(",");let mut affected=0u64;for batch in rows.chunks(250){let vals=batch.iter().map(|r|{let a=r.as_array().cloned().unwrap_or_default();format!("({})",a.iter().map(|v|literal(v,&c.engine)).collect::<Vec<_>>().join(","))}).collect::<Vec<_>>().join(",");let mode=inp.get("mode").and_then(Value::as_str).unwrap_or("insert");let verb=if !is_pg(&c.engine)&&!is_mssql(&c.engine)&&mode=="replace"{"REPLACE"}else if !is_pg(&c.engine)&&!is_mssql(&c.engine)&&mode=="ignore"{"INSERT IGNORE"}else{"INSERT"};let suffix=if is_pg(&c.engine)&&mode=="ignore"{" ON CONFLICT DO NOTHING"}else{""};if is_mssql(&c.engine)&&mode=="ignore"{return Err("MSSQL import ignore modu desteklenmiyor; insert modunu kullanın.".into())}if is_mssql(&c.engine)&&mode=="replace"{return Err("MSSQL replace modu desteklenmiyor; upsert sorgusunu SQL editöründen çalıştırın.".into())}let sql=format!("{} INTO {} ({}) VALUES {}{}",verb,qualified(db,table,&c.engine)?,cs,vals,suffix);let rr=execute_sql(c,&sql,Some(db),1).await?;affected+=num(rr.get("affectedRows"));}Ok(json!({"affectedRows":affected,"rowCount":rows.len()}))},
 "export-data"=>{let inp=p.get("exportInput").and_then(Value::as_object).ok_or("Export bilgisi eksik.")?;let db=payload_str(inp,"database")?;let table=payload_str(inp,"table")?;let limit=inp.get("limit").and_then(Value::as_u64).unwrap_or(5000).min(50000);let offset=inp.get("offset").and_then(Value::as_u64).unwrap_or(0);let cols=inp.get("columns").and_then(Value::as_array).filter(|x|!x.is_empty()).map(|x|x.iter().filter_map(Value::as_str).map(|v|ident(v,&c.engine)).collect::<Result<Vec<_>,_>>()).transpose()?.map(|x|x.join(",")).unwrap_or("*".into());let order=if let Some(o)=inp.get("orderBy").and_then(Value::as_str){format!(" ORDER BY {} {}",ident(o,&c.engine)?,if inp.get("orderDirection").and_then(Value::as_str)==Some("desc"){"DESC"}else{"ASC"})}else{String::new()};let sql=if is_mssql(&c.engine){format!("SELECT {} FROM {}{}{} OFFSET {} ROWS FETCH NEXT {} ROWS ONLY",cols,qualified(db,table,&c.engine)?,if order.is_empty(){" ORDER BY (SELECT NULL)"}else{&order},"",offset,limit)}else{format!("SELECT {} FROM {}{} LIMIT {} OFFSET {}",cols,qualified(db,table,&c.engine)?,order,limit,offset)};let rows=rows_of(&execute_sql(c,&sql,Some(db),limit as usize).await?);let columns=rows.first().and_then(Value::as_object).map(|x|x.keys().cloned().collect::<Vec<_>>()).unwrap_or_default();Ok(json!({"rowCount":rows.len(),"columns":columns,"rows":rows}))},
 "performance-snapshot"=>performance(c,p,max).await,
 "user-save"=>{
   if c.read_only{return Err("Salt okunur.".into())}
   let input=p.get("userInput").and_then(Value::as_object).ok_or("Kullanıcı bilgisi eksik.")?;
   let user=payload_str(input,"user")?;let host=input.get("host").and_then(Value::as_str).unwrap_or("%");let password=input.get("password").and_then(Value::as_str).unwrap_or("");
   if is_pg(&c.engine){
     let exists=rows_of(&execute_sql(c,&format!("SELECT 1 FROM pg_roles WHERE rolname={}",literal(&json!(user),&c.engine)),None,1).await?);
     let sql=if exists.is_empty(){format!("CREATE ROLE {} LOGIN{}",ident(user,&c.engine)?,if password.is_empty(){String::new()}else{format!(" PASSWORD {}",literal(&json!(password),&c.engine))})}else if password.is_empty(){format!("ALTER ROLE {} LOGIN",ident(user,&c.engine)?)}else{format!("ALTER ROLE {} LOGIN PASSWORD {}",ident(user,&c.engine)?,literal(&json!(password),&c.engine))};
     execute_sql(c,&sql,None,1).await?;
   }else if is_mssql(&c.engine){
     let exists=rows_of(&execute_sql(c,&format!("SELECT 1 AS found FROM sys.server_principals WHERE name={}",literal(&json!(user),&c.engine)),None,1).await?);
     if exists.is_empty(){if password.is_empty(){return Err("MSSQL login oluşturmak için parola gereklidir.".into())}execute_sql(c,&format!("CREATE LOGIN {} WITH PASSWORD={}",ident(user,&c.engine)?,literal(&json!(password),&c.engine)),None,1).await?;}else if !password.is_empty(){execute_sql(c,&format!("ALTER LOGIN {} WITH PASSWORD={}",ident(user,&c.engine)?,literal(&json!(password),&c.engine)),None,1).await?;}
     execute_sql(c,&format!("ALTER LOGIN {} {}",ident(user,&c.engine)?,if input.get("accountLocked").and_then(Value::as_bool).unwrap_or(false){"DISABLE"}else{"ENABLE"}),None,1).await?;
   }else{
     let target=format!("{}@{}",literal(&json!(user),&c.engine),literal(&json!(host),&c.engine));
     if input.get("createIfMissing").and_then(Value::as_bool).unwrap_or(true){let sql=if password.is_empty(){format!("CREATE USER IF NOT EXISTS {}",target)}else{format!("CREATE USER IF NOT EXISTS {} IDENTIFIED BY {}",target,literal(&json!(password),&c.engine))};execute_sql(c,&sql,None,1).await?;}
     let mut clauses=Vec::new();if !password.is_empty(){clauses.push(format!("IDENTIFIED BY {}",literal(&json!(password),&c.engine)))}if c.engine=="mysql"{clauses.push(if input.get("accountLocked").and_then(Value::as_bool).unwrap_or(false){"ACCOUNT LOCK".into()}else{"ACCOUNT UNLOCK".into()});clauses.push(if input.get("passwordExpired").and_then(Value::as_bool).unwrap_or(false){"PASSWORD EXPIRE".into()}else{"PASSWORD EXPIRE NEVER".into()});}if !clauses.is_empty(){execute_sql(c,&format!("ALTER USER {} {}",target,clauses.join(" ")),None,1).await?;}
   }
   Ok(json!({"saved":true,"user":user,"host":host}))
 },
 "privilege-change"=>{
   if c.read_only{return Err("Salt okunur.".into())}
   let input=p.get("privilegeInput").and_then(Value::as_object).ok_or("Yetki bilgisi eksik.")?;let user=payload_str(input,"user")?;
   let privileges=input.get("privileges").and_then(Value::as_array).ok_or("Yetkiler eksik.")?.iter().filter_map(Value::as_str).map(|x|x.trim().to_ascii_uppercase()).filter(|x|!x.is_empty()).collect::<Vec<_>>();if privileges.is_empty(){return Err("Yetki listesi boş.".into())}
   let allowed=["SELECT","INSERT","UPDATE","DELETE","CREATE","DROP","ALTER","INDEX","REFERENCES","CREATE VIEW","SHOW VIEW","TRIGGER","EXECUTE","EVENT","CREATE ROUTINE","ALTER ROUTINE","CREATE TEMPORARY TABLES","LOCK TABLES","PROCESS","RELOAD","REPLICATION CLIENT","REPLICATION SLAVE","SHOW DATABASES"];
   if privileges.iter().any(|x|!allowed.contains(&x.as_str())){return Err("Desteklenmeyen privilege.".into())}
   let revoke=input.get("mode").and_then(Value::as_str)==Some("revoke");let scope=input.get("scope").and_then(Value::as_str).unwrap_or("global");let db=input.get("database").and_then(Value::as_str).unwrap_or("");let table=input.get("table").and_then(Value::as_str).unwrap_or("");
   if is_pg(&c.engine){let target=if scope=="global"{"DATABASE postgres".to_string()}else if scope=="database"{format!("DATABASE {}",ident(db,&c.engine)?)}else{format!("TABLE {}",qualified(db,table,&c.engine)?)};let sql=format!("{} {} ON {} {} {}",if revoke{"REVOKE"}else{"GRANT"},privileges.join(", "),target,if revoke{"FROM"}else{"TO"},ident(user,&c.engine)?);execute_sql(c,&sql,if db.is_empty(){None}else{Some(db)},1).await?;
   }else if is_mssql(&c.engine){let target=if scope=="global"{String::new()}else if scope=="database"{format!(" ON DATABASE::{}",ident(db,&c.engine)?)}else{format!(" ON OBJECT::{}",qualified(db,table,&c.engine)?)};let sql=format!("{} {}{} {} {}",if revoke{"REVOKE"}else{"GRANT"},privileges.join(", "),target,if revoke{"FROM"}else{"TO"},ident(user,&c.engine)?);execute_sql(c,&sql,if db.is_empty(){None}else{Some(db)},1).await?;
   }else{let host=input.get("host").and_then(Value::as_str).unwrap_or("%");let target=format!("{}@{}",literal(&json!(user),&c.engine),literal(&json!(host),&c.engine));let target_scope=if scope=="global"{"*.*".into()}else if scope=="database"{format!("{}.*",ident(db,&c.engine)?)}else{format!("{}.{}",ident(db,&c.engine)?,ident(table,&c.engine)?)};let sql=format!("{} {} ON {} {} {}{}",if revoke{"REVOKE"}else{"GRANT"},privileges.join(", "),target_scope,if revoke{"FROM"}else{"TO"},target,if !revoke&&input.get("withGrantOption").and_then(Value::as_bool).unwrap_or(false){" WITH GRANT OPTION"}else{""});execute_sql(c,&sql,None,1).await?;}
   Ok(json!({"changed":true}))
 },
 _=>Err(format!("Desteklenmeyen native workbench action: {}",action))
 }
}

async fn performance(c:&Connection,p:&Map<String,Value>,max:usize)->Result<Value,String>{
 if !is_pg(&c.engine)&&!is_mssql(&c.engine){
  let status=rows_of(&execute_sql(c,"SHOW GLOBAL STATUS",None,max).await?);
  let vars=rows_of(&execute_sql(c,"SHOW GLOBAL VARIABLES WHERE Variable_name IN ('max_connections','innodb_page_size')",None,max).await.unwrap_or(json!({"rows":[]})));
  let schema=rows_of(&execute_sql(c,"SELECT TABLE_SCHEMA AS schemaName,COALESCE(SUM(DATA_LENGTH),0) AS dataBytes,COALESCE(SUM(INDEX_LENGTH),0) AS indexBytes,COALESCE(SUM(DATA_FREE),0) AS freeBytes FROM information_schema.TABLES WHERE TABLE_SCHEMA NOT IN ('information_schema','performance_schema','mysql','sys') GROUP BY TABLE_SCHEMA ORDER BY COALESCE(SUM(DATA_LENGTH),0)+COALESCE(SUM(INDEX_LENGTH),0) DESC",None,12).await.unwrap_or(json!({"rows":[]})));
  let mut sm=std::collections::HashMap::new();for x in status{if let(Some(k),Some(v))=(x.get("Variable_name").and_then(Value::as_str),x.get("Value")){sm.insert(k.to_string(),num(Some(v)));}}
  let mut vm=std::collections::HashMap::new();for x in vars{if let(Some(k),Some(v))=(x.get("Variable_name").and_then(Value::as_str),x.get("Value")){vm.insert(k.to_string(),num(Some(v)));}}
  let total=*sm.get("Innodb_buffer_pool_pages_total").unwrap_or(&0);let free=*sm.get("Innodb_buffer_pool_pages_free").unwrap_or(&0);let dirty=*sm.get("Innodb_buffer_pool_pages_dirty").unwrap_or(&0);let reads=*sm.get("Innodb_buffer_pool_reads").unwrap_or(&0);let req=*sm.get("Innodb_buffer_pool_read_requests").unwrap_or(&0);
  let top_schemas=schema.iter().map(|x|{let data=num(x.get("dataBytes"));let index=num(x.get("indexBytes"));let freeb=num(x.get("freeBytes"));json!({"schema":x.get("schemaName"),"dataBytes":data,"indexBytes":index,"freeBytes":freeb,"totalBytes":data+index})}).collect::<Vec<_>>();
  let data_bytes=top_schemas.iter().map(|x|num(x.get("dataBytes"))).sum::<u64>();let index_bytes=top_schemas.iter().map(|x|num(x.get("indexBytes"))).sum::<u64>();let free_bytes=top_schemas.iter().map(|x|num(x.get("freeBytes"))).sum::<u64>();
  let mut replica=rows_of(&execute_sql(c,"SHOW REPLICA STATUS",None,1).await.unwrap_or(json!({"rows":[]})));
  if replica.is_empty(){replica=rows_of(&execute_sql(c,"SHOW SLAVE STATUS",None,1).await.unwrap_or(json!({"rows":[]})));}
  let replication=if let Some(ro)=replica.first().and_then(Value::as_object){
    let io=ro.get("Replica_IO_Running").or_else(||ro.get("Slave_IO_Running")).and_then(Value::as_str);
    let sq=ro.get("Replica_SQL_Running").or_else(||ro.get("Slave_SQL_Running")).and_then(Value::as_str);
    let seconds=ro.get("Seconds_Behind_Source").or_else(||ro.get("Seconds_Behind_Master")).map(|x|num(Some(x)));
    json!({"available":true,"running":match(io,sq){(Some(a),Some(b))=>Some(a.eq_ignore_ascii_case("yes")&&b.eq_ignore_ascii_case("yes")),_=>None},"secondsBehind":seconds,"ioRunning":io,"sqlRunning":sq,"sourceHost":ro.get("Source_Host").or_else(||ro.get("Master_Host")),"channelName":ro.get("Channel_Name").or_else(||ro.get("Connection_name")),"lastError":ro.get("Last_Error").or_else(||ro.get("Last_SQL_Error")).or_else(||ro.get("Last_IO_Error"))})
  }else{json!({"available":false,"running":null,"secondsBehind":null,"ioRunning":null,"sqlRunning":null,"sourceHost":null,"channelName":null,"lastError":null})};
  return Ok(json!({"sampledAt":Utc::now().to_rfc3339(),"uptimeSeconds":sm.get("Uptime").copied().unwrap_or(0),"questions":sm.get("Questions").copied().unwrap_or(0),"threadsConnected":sm.get("Threads_connected").copied().unwrap_or(0),"threadsRunning":sm.get("Threads_running").copied().unwrap_or(0),"maxUsedConnections":sm.get("Max_used_connections").copied().unwrap_or(0),"maxConnections":vm.get("max_connections"),"slowQueries":sm.get("Slow_queries").copied().unwrap_or(0),"abortedConnects":sm.get("Aborted_connects").copied().unwrap_or(0),"bytesReceived":sm.get("Bytes_received").copied().unwrap_or(0),"bytesSent":sm.get("Bytes_sent").copied().unwrap_or(0),"bufferPool":{"totalPages":total,"freePages":free,"dataPages":sm.get("Innodb_buffer_pool_pages_data").copied().unwrap_or(0),"dirtyPages":dirty,"pageSize":vm.get("innodb_page_size").copied().unwrap_or(16384),"usagePercent":if total>0{(total-free)as f64/total as f64*100.0}else{0.0},"dirtyPercent":if total>0{dirty as f64/total as f64*100.0}else{0.0},"hitRatio":if req>0{Some((1.0-reads as f64/req as f64).clamp(0.0,1.0))}else{None},"reads":reads,"readRequests":req},"replication":replication,"storage":{"dataBytes":data_bytes,"indexBytes":index_bytes,"freeBytes":free_bytes,"totalBytes":data_bytes+index_bytes,"selectedDatabaseBytes":null,"topSchemas":top_schemas}}))
 }
 if is_pg(&c.engine){
   let db=p.get("database").and_then(Value::as_str).or(c.database.as_deref()).unwrap_or("postgres");
   let sql="SELECT EXTRACT(EPOCH FROM(now()-pg_postmaster_start_time()))::bigint AS uptime,COALESCE(xact_commit+xact_rollback,0)::bigint AS questions,numbackends::bigint AS connected,COALESCE(blks_read,0)::bigint AS reads,COALESCE(blks_hit,0)::bigint AS hits,COALESCE(temp_bytes,0)::bigint AS tempBytes FROM pg_stat_database WHERE datname=current_database()";
   let row=rows_of(&execute_sql(c,sql,Some(db),1).await?).into_iter().next().unwrap_or(json!({}));
   let running=rows_of(&execute_sql(c,"SELECT COUNT(*) AS n FROM pg_stat_activity WHERE state='active'",Some(db),1).await?).first().and_then(|x|x.get("n")).map(|x|num(Some(x))).unwrap_or(0);
   let max_conn=rows_of(&execute_sql(c,"SELECT current_setting('max_connections')::bigint AS n",Some(db),1).await?).first().and_then(|x|x.get("n")).map(|x|num(Some(x))).unwrap_or(0);
   let size=rows_of(&execute_sql(c,"SELECT pg_database_size(current_database())::bigint AS n",Some(db),1).await?).first().and_then(|x|x.get("n")).map(|x|num(Some(x))).unwrap_or(0);
   let reads=num(row.get("reads"));let hits=num(row.get("hits"));let total=reads+hits;
   return Ok(json!({"sampledAt":Utc::now().to_rfc3339(),"uptimeSeconds":num(row.get("uptime")),"questions":num(row.get("questions")),"threadsConnected":num(row.get("connected")),"threadsRunning":running,"maxUsedConnections":num(row.get("connected")),"maxConnections":max_conn,"slowQueries":0,"abortedConnects":0,"bytesReceived":0,"bytesSent":0,"bufferPool":{"totalPages":total,"freePages":0,"dataPages":hits,"dirtyPages":0,"pageSize":8192,"usagePercent":if total>0{hits as f64/total as f64*100.0}else{0.0},"dirtyPercent":0,"hitRatio":if total>0{Some(hits as f64/total as f64)}else{None},"reads":reads,"readRequests":total},"replication":{"available":false,"running":null,"secondsBehind":null,"ioRunning":null,"sqlRunning":null,"sourceHost":null,"channelName":null,"lastError":null},"storage":{"dataBytes":size,"indexBytes":0,"freeBytes":0,"totalBytes":size,"selectedDatabaseBytes":size,"topSchemas":[{"schema":db,"dataBytes":size,"indexBytes":0,"freeBytes":0,"totalBytes":size}]}}))
 }
 let db=p.get("database").and_then(Value::as_str).or(c.database.as_deref());
 let stats=rows_of(&execute_sql(c,"SELECT DATEDIFF(SECOND,sqlserver_start_time,SYSDATETIME()) AS uptime,(SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process=1) AS connected,(SELECT COUNT(*) FROM sys.dm_exec_requests WHERE session_id<>@@SPID) AS running,@@MAX_CONNECTIONS AS maxConnections FROM sys.dm_os_sys_info",db,1).await?).into_iter().next().unwrap_or(json!({}));
 let size=rows_of(&execute_sql(c,"SELECT COALESCE(SUM(size),0)*8192 AS bytes FROM sys.database_files",db,1).await.unwrap_or(json!({"rows":[]}))).first().and_then(|x|x.get("bytes")).map(|x|num(Some(x))).unwrap_or(0);
 Ok(json!({"sampledAt":Utc::now().to_rfc3339(),"uptimeSeconds":num(stats.get("uptime")),"questions":0,"threadsConnected":num(stats.get("connected")),"threadsRunning":num(stats.get("running")),"maxUsedConnections":num(stats.get("connected")),"maxConnections":num(stats.get("maxConnections")),"slowQueries":0,"abortedConnects":0,"bytesReceived":0,"bytesSent":0,"bufferPool":{"totalPages":0,"freePages":0,"dataPages":0,"dirtyPages":0,"pageSize":8192,"usagePercent":0,"dirtyPercent":0,"hitRatio":null,"reads":0,"readRequests":0},"replication":{"available":false,"running":null,"secondsBehind":null,"ioRunning":null,"sqlRunning":null,"sourceHost":null,"channelName":null,"lastError":null},"storage":{"dataBytes":size,"indexBytes":0,"freeBytes":0,"totalBytes":size,"selectedDatabaseBytes":size,"topSchemas":[]}}))
}
pub async fn execute_action(request:DatabaseRequest,max_rows:usize,max_page:usize)->Result<Value,String>{
 let action=request.action.clone();let c=request.connection.ok_or("Bağlantı bilgisi eksik.")?;let p=request.payload;
 match action.as_str(){
 "test"=>{let sql=if is_mssql(&c.engine){"SELECT @@VERSION AS version,DB_NAME() AS databaseName,SUSER_SNAME() AS currentUser"}else if is_pg(&c.engine){"SELECT version() AS version,current_database() AS \"databaseName\",current_user AS \"currentUser\""}else{"SELECT VERSION() AS version,DATABASE() AS databaseName,CURRENT_USER() AS currentUser"};let r=execute_sql(&c,sql,p.get("database").and_then(Value::as_str),1).await?;let row=rows_of(&r).into_iter().next().unwrap_or(json!({}));Ok(json!({"connection":{"version":row.get("version"),"databaseName":row.get("databaseName"),"currentUser":row.get("currentUser")},"_meta":{"statements":[{"label":"Bağlantı testi","sql":sql}]}}))},
 "catalog"=>catalog(&c,max_rows).await,
 "table-data"=>table_data(&c,&p,max_page).await,
 "table-info"=>table_info(&c,&p,max_rows).await,
 "update-cell"=>update_cell(&c,&p).await,
 "delete-rows"=>delete_rows(&c,&p).await,
 "alter-table"=>alter_table(&c,&p,max_rows).await,
 "query"=>{let sql=payload_str(&p,"sql")?;execute_sql(&c,sql,p.get("database").and_then(Value::as_str),max_rows).await},
 other=>workbench(&c,other,&p,max_rows).await
 }
}
