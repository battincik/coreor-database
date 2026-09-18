'use client';

import React, { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, ChevronDown,
  ChevronUp, Clock, Copy, Database, Download, Filter, Gauge, HardDrive, Info, Loader2,
  Network, PlugZap, Server, Table, Terminal, Timer, Trash2, Wifi, XCircle
} from 'lucide-react';
import type { GridRuntimeStatus } from 'types';
import type { DatabasePerformanceSnapshot } from '@/lib/databaseWorkbenchTypes';
import { Button } from '@/components/ui/button';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useDesktop } from '@/context/DesktopContext';
import { databaseEngineDefinition, databaseEngineLabel } from '@/lib/databaseEngines';
import { fetchDatabasePerformanceSnapshot } from '@/lib/databaseWorkbenchApi';
import { clearActivities, exportActivities, getActivitiesServerSnapshot, getActivitiesSnapshot, subscribeActivities, type ActivityEntry } from '@/lib/activityConsole';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useAppContextMenu } from '@/components/app-context-menu';
import { openQueryTab } from '@/lib/queryWorkspaceEvents';

interface BottomBarProps { selectedDatabase?: string | null; selectedTable?: string | null }
type ConsoleFilter = 'all' | 'success' | 'errors';
interface TooltipRow { label: string; value: React.ReactNode; tone?: 'normal' | 'success' | 'warning' | 'danger' }
interface TooltipState { title: string; description?: string; rows: TooltipRow[]; x: number; y: number }

const EMPTY_GRID_STATUS: GridRuntimeStatus = { page:1,pageSize:50,totalRows:0,totalPages:1,filters:0,sorts:0,isLoading:false };
const SESSION_KEY = 'coreor:active-connection-session:v1';

function formatBytes(value:number){if(!Number.isFinite(value)||value<=0)return'0 B';const units=['B','KB','MB','GB','TB','PB'];const index=Math.min(Math.floor(Math.log(value)/Math.log(1024)),units.length-1);const amount=value/1024**index;return`${amount.toLocaleString('tr-TR',{maximumFractionDigits:amount>=100?0:amount>=10?1:2})} ${units[index]}`;}
function formatDuration(totalSeconds:number,detailed=false){const seconds=Math.max(0,Math.floor(totalSeconds));const values=[[Math.floor(seconds/86400),detailed?'gün':'g'],[Math.floor(seconds%86400/3600),detailed?'saat':'sa'],[Math.floor(seconds%3600/60),'dk'],[seconds%60,'sn']]as const;const visible=values.filter(([value])=>value>0).slice(0,detailed?4:2);return visible.length?visible.map(([value,unit])=>`${value} ${unit}`).join(' '):'0 sn';}
function formatDate(value:string|number){return new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));}
function statusIcon(level:ActivityEntry['level']){return level==='success'?<CheckCircle2 className="h-3 w-3 text-emerald-400"/>:level==='warning'?<AlertTriangle className="h-3 w-3 text-amber-400"/>:level==='error'?<XCircle className="h-3 w-3 text-red-400"/>:<CheckCircle2 className="h-3 w-3 text-cyan-400"/>;}
function downloadLog(){const blob=new Blob([exportActivities()],{type:'application/json'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`coreor-sql-log-${Date.now()}.json`;anchor.click();URL.revokeObjectURL(url);}

function MetricTooltip({ state }: { state: TooltipState | null }) {
  if (!state || typeof document === 'undefined') return null;
  const width = 340;
  const left = Math.min(Math.max(10, state.x - width / 2), window.innerWidth - width - 10);
  const top = Math.max(10, state.y - 18);
  return createPortal(<div className="pointer-events-none fixed z-[2147483100] w-[340px] -translate-y-full rounded-2xl border border-zinc-700 bg-zinc-950/98 p-4 shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-xl" style={{left,top}}><div className="flex items-start gap-2 border-b border-zinc-800 pb-3"><span className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10"><Info className="h-3.5 w-3.5 text-cyan-300"/></span><div><div className="text-[11px] font-semibold text-zinc-100">{state.title}</div>{state.description&&<div className="mt-1 text-[9px] leading-4 text-zinc-500">{state.description}</div>}</div></div><div className="mt-3 space-y-2">{state.rows.map((row,index)=><div key={`${row.label}-${index}`} className="flex items-start justify-between gap-5 text-[10px] leading-4"><span className="shrink-0 text-zinc-600">{row.label}</span><span className={`min-w-0 break-words text-right ${row.tone==='success'?'text-emerald-400':row.tone==='warning'?'text-amber-400':row.tone==='danger'?'text-red-400':'text-zinc-200'}`}>{row.value}</span></div>)}</div></div>,document.body);
}

function Metric({ children, title, description, rows, onTooltip }: { children: React.ReactNode; title: string; description?: string; rows: TooltipRow[]; onTooltip: (state: TooltipState | null) => void }) {
  return <button type="button" className="flex h-full shrink-0 items-center gap-1.5 px-2 text-left transition hover:bg-white/[0.045] hover:text-zinc-200" onMouseEnter={event=>{const rect=event.currentTarget.getBoundingClientRect();onTooltip({title,description,rows,x:rect.left+rect.width/2,y:rect.top});}} onMouseMove={event=>onTooltip({title,description,rows,x:event.clientX,y:event.currentTarget.getBoundingClientRect().top})} onMouseLeave={()=>onTooltip(null)} onFocus={event=>{const rect=event.currentTarget.getBoundingClientRect();onTooltip({title,description,rows,x:rect.left+rect.width/2,y:rect.top});}} onBlur={()=>onTooltip(null)}>{children}</button>;
}

export default function BottomBar({selectedDatabase,selectedTable}:BottomBarProps){
  const{openContextMenu}=useAppContextMenu();
  const{workspaceKey}=useDesktop();const{servers,activeServerId,isServersLoading}=useContext(DatabaseContext)!;const activeServer=servers.find(server=>server.id===activeServerId)||null;const definition=databaseEngineDefinition(activeServer?.databaseType);const supportsMetrics=activeServer?.databaseType==='mysql'||activeServer?.databaseType==='mariadb';
  const[consoleOpen,setConsoleOpen]=useState(false);const[expandedActivityId,setExpandedActivityId]=useState<string|null>(null);const[filter,setFilter]=useState<ConsoleFilter>('all');const[grid,setGrid]=useState<GridRuntimeStatus>(EMPTY_GRID_STATUS);const[snapshot,setSnapshot]=useState<DatabasePerformanceSnapshot|null>(null);const[snapshotError,setSnapshotError]=useState<string|null>(null);const[loading,setLoading]=useState(false);const[startedAt,setStartedAt]=useState<number|null>(null);const[now,setNow]=useState(Date.now());const[tooltip,setTooltip]=useState<TooltipState|null>(null);const entries=useSyncExternalStore(subscribeActivities,getActivitiesSnapshot,getActivitiesServerSnapshot);const endRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{const handler=(event:Event)=>setGrid((event as CustomEvent<GridRuntimeStatus>).detail||EMPTY_GRID_STATUS);window.addEventListener('coreor:grid-status',handler);return()=>window.removeEventListener('coreor:grid-status',handler);},[]);
  useEffect(()=>{if(!activeServerId){setStartedAt(null);sessionStorage.removeItem(SESSION_KEY);return;}let session:{serverId:string;startedAt:number}|null=null;try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch{}if(!session||session.serverId!==activeServerId){session={serverId:activeServerId,startedAt:Date.now()};sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));}setStartedAt(session.startedAt);},[activeServerId]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(!activeServerId||!workspaceKey||!supportsMetrics){setSnapshot(null);setSnapshotError(activeServer&&!supportsMetrics?`${databaseEngineLabel(activeServer.databaseType)} için gelişmiş motor metrikleri henüz sınırlı.`:null);return;}let disposed=false;const refresh=async()=>{if(disposed||document.visibilityState!=='visible')return;setLoading(true);try{const value=await fetchDatabasePerformanceSnapshot(activeServerId,workspaceKey,selectedDatabase||null);if(!disposed){setSnapshot(value);setSnapshotError(null);}}catch(error){if(!disposed)setSnapshotError(error instanceof Error?error.message:'Metrikler alınamadı.');}finally{if(!disposed)setLoading(false);}};const onVisibility=()=>{if(document.visibilityState==='visible')void refresh();};void refresh();const timer=setInterval(()=>void refresh(),30000);document.addEventListener('visibilitychange',onVisibility);return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility);};},[activeServerId,workspaceKey,selectedDatabase,supportsMetrics,activeServer?.databaseType]);
  const filtered=useMemo(()=>filter==='success'?entries.filter(item=>item.level==='success'):filter==='errors'?entries.filter(item=>item.level==='error'||item.level==='warning'):entries,[entries,filter]);
  const openActivityMenu=(event:React.MouseEvent,item:ActivityEntry)=>openContextMenu(event,[
    {id:'open-query',label:'SQL editöründe aç',icon:Terminal,disabled:!item.sql.trim(),onSelect:()=>openQueryTab({serverId:item.serverId,databaseName:item.databaseName||null,title:item.title||'SQL günlüğü',sql:item.sql})},
    {id:'copy-sql',label:'SQL’i kopyala',icon:Copy,disabled:!item.sql.trim(),onSelect:()=>navigator.clipboard.writeText(item.sql)},
    {id:'copy-info',label:'Kayıt özetini kopyala',icon:Copy,onSelect:()=>navigator.clipboard.writeText(`${item.serverName} • ${item.databaseName||'sunucu geneli'} • ${item.durationMs??'—'} ms\n${item.sql}`)},
    {id:'sep-filter',separator:true},
    {id:'filter-success',label:'Yalnız başarılıları göster',icon:CheckCircle2,onSelect:()=>setFilter('success')},
    {id:'filter-errors',label:'Yalnız hata/uyarıları göster',icon:XCircle,onSelect:()=>setFilter('errors')},
    {id:'filter-all',label:'Tüm kayıtları göster',icon:Terminal,onSelect:()=>setFilter('all')}
  ],item.title||'SQL işlemi');
  const stats=useMemo(()=>{const successful=entries.filter(item=>item.level==='success').length;const errors=entries.filter(item=>item.level==='error').length;const durations=entries.map(item=>item.durationMs).filter((value):value is number=>typeof value==='number');return{successful,errors,rate:successful+errors?Math.round(successful/(successful+errors)*100):100,average:durations.length?Math.round(durations.reduce((sum,value)=>sum+value,0)/durations.length):0,last:entries.at(-1)};},[entries]);
  useEffect(()=>{if(consoleOpen)endRef.current?.scrollIntoView({block:'end'});},[consoleOpen,filtered.length]);
  const connectionSeconds=startedAt?Math.floor((now-startedAt)/1000):0;const target=selectedDatabase||activeServer?.databaseName||'Sunucu geneli';
  const catalogStorageBytes=(activeServer?.databases||[]).reduce((sum,database)=>sum+(Number(database.totalSizeMB)||0)*1024*1024,0);
  const selectedCatalogBytes=selectedDatabase?(Number(activeServer?.databases?.find(database=>database.name===selectedDatabase)?.totalSizeMB)||0)*1024*1024:null;
  const serverStorageBytes=snapshot?.storage.totalBytes||catalogStorageBytes;
  const selectedStorageBytes=selectedDatabase?(snapshot?.storage.selectedDatabaseBytes??selectedCatalogBytes):null;
  const displayedStorageBytes=selectedStorageBytes??serverStorageBytes;

  return <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 text-xs">
    <div className={`flex flex-col transition-[height] ${consoleOpen?'h-[212px]':'h-8'}`}><div className="flex h-8 shrink-0 items-center border-b border-zinc-800 px-2"><button className="flex items-center gap-2 text-zinc-300" onClick={()=>setConsoleOpen(value=>!value)}><Terminal className="h-3.5 w-3.5"/>SQL günlüğü <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px]">{entries.length}</span>{consoleOpen?<ChevronDown className="h-3 w-3"/>:<ChevronUp className="h-3 w-3"/>}</button>{consoleOpen&&<div className="ml-auto flex items-center gap-1">{(['all','success','errors']as ConsoleFilter[]).map(item=><button key={item} className={`rounded px-2 py-1 text-[9px] ${filter===item?'bg-zinc-800':'text-zinc-600'}`} onClick={()=>setFilter(item)}>{item==='all'?'Tümü':item==='success'?'Başarılı':'Hatalar'}</button>)}<Button variant="ghost" size="icon" className="h-6 w-6" onClick={downloadLog}><Download className="h-3.5 w-3.5"/></Button><Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={clearActivities}><Trash2 className="h-3.5 w-3.5"/></Button></div>}</div>{consoleOpen&&<div className="min-h-0 flex-1 overflow-auto font-mono text-[9px]">{filtered.map(item=>{const expanded=expandedActivityId===item.id;return expanded
          ? <div key={item.id} className="border-b border-cyan-500/20 bg-cyan-500/[0.025]">
              <button type="button" onClick={()=>setExpandedActivityId(null)} onContextMenu={event=>openActivityMenu(event,item)} className="grid h-7 w-full grid-cols-[18px_80px_minmax(160px,1fr)_80px] items-center gap-1 px-1 text-left transition hover:bg-white/[0.025]" title="Tek satıra daralt">
                <span>{statusIcon(item.level)}</span>
                <span className="text-zinc-600">{new Date(item.timestamp).toLocaleTimeString('tr-TR')}</span>
                <span className="truncate text-zinc-400">{item.serverName} • {item.databaseName||'genel'}{item.tableName? ` • ${item.tableName}` : ''}</span>
                <span className="text-right text-zinc-600">{item.durationMs??'—'} ms</span>
              </button>
              <button type="button" onClick={()=>setExpandedActivityId(null)} onContextMenu={event=>openActivityMenu(event,item)} className="block w-full border-t border-zinc-900/80 bg-black/25 px-6 py-2 text-left hover:bg-black/35" title="Tek satıra daralt">
                <code className="block whitespace-pre-wrap break-words font-mono text-[9px] leading-4 text-cyan-300">{item.sql}</code>
              </button>
            </div>
          : <button type="button" key={item.id} onClick={()=>setExpandedActivityId(item.id)} onContextMenu={event=>openActivityMenu(event,item)} className="grid min-h-5 w-full grid-cols-[18px_80px_190px_minmax(300px,1fr)_80px] items-center border-b border-zinc-900 px-1 text-left transition hover:bg-white/[0.025]" title="Sorgunun tamamını göster">
              <span>{statusIcon(item.level)}</span>
              <span className="text-zinc-600">{new Date(item.timestamp).toLocaleTimeString('tr-TR')}</span>
              <span className="truncate text-zinc-500">{item.serverName} • {item.databaseName||'genel'}</span>
              <code className="truncate text-cyan-300">{item.sql.replace(/\s+/g,' ')}</code>
              <span className="text-right text-zinc-600">{item.durationMs??'—'} ms</span>
            </button>;})}<div ref={endRef}/></div>}</div>
    <div className="flex h-8 border-t border-zinc-800 text-[9px] text-zinc-500"><div className="coreor-hide-scrollbar min-w-0 flex-1 overflow-x-auto"><div className="flex h-full min-w-max items-center divide-x divide-zinc-800">
      <Metric title="Bağlantı durumu" description="Son sağlık kontrolü ve aktif bağlantı profili." rows={[{label:'Durum',value:!activeServer?'Sunucu seçilmedi':snapshotError?'Kontrol sınırlı':'Bağlı',tone:snapshotError?'warning':'success'},{label:'Motor',value:activeServer?databaseEngineLabel(activeServer.databaseType):'—'},{label:'Son kontrol',value:snapshot?.sampledAt?formatDate(snapshot.sampledAt):'—'},{label:'Hata',value:snapshotError||'Yok'}]} onTooltip={setTooltip}>{loading?<Loader2 className="h-3 w-3 animate-spin"/>:<Wifi className={`h-3 w-3 ${activeServer?'text-emerald-400':'text-zinc-600'}`}/>} {activeServer?'Bağlı':'Bağlantı yok'}</Metric>
      <Metric title="Sunucu profili" description="Motor, sürüm, host ve güvenlik ayarları." rows={[{label:'Profil',value:activeServer?.name||'—'},{label:'Motor',value:definition.label},{label:'Host',value:activeServer?`${activeServer.host}:${activeServer.port}`:'—'},{label:'Kullanıcı',value:activeServer?.username||'—'},{label:'TLS',value:activeServer?.sslMode||'—'}]} onTooltip={setTooltip}><Server className="h-3 w-3"/> {definition.label}</Metric>
      <Metric title="Sunucu uptime" description="Veritabanı motorunun yeniden başlatılmadan çalıştığı süre." rows={[{label:'Uptime',value:snapshot?formatDuration(snapshot.uptimeSeconds,true):'—'},{label:'Toplam sorgu',value:snapshot?.questions.toLocaleString('tr-TR')||'—'},{label:'Slow query',value:snapshot?.slowQueries.toLocaleString('tr-TR')||'—',tone:snapshot?.slowQueries?'warning':'normal'}]} onTooltip={setTooltip}><Timer className="h-3 w-3 text-cyan-400"/> {snapshot?formatDuration(snapshot.uptimeSeconds):'Uptime —'}</Metric>
      <Metric title="Coreor bağlantı süresi" description="Aktif sunucu profilinin bu uygulama oturumunda seçili kaldığı süre; sürekli açık DB bağlantısı değildir." rows={[{label:'Süre',value:activeServer?formatDuration(connectionSeconds,true):'—'},{label:'Başlangıç',value:startedAt?formatDate(startedAt):'—'},{label:'Profil',value:activeServer?.name||'—'}]} onTooltip={setTooltip}><PlugZap className="h-3 w-3 text-emerald-400"/> {activeServer?formatDuration(connectionSeconds):'—'}</Metric>
      <Metric title="Aktif hedef" description="Sorgu ve tablo işlemlerinin mevcut kapsamı." rows={[{label:'Veritabanı',value:target},{label:'Tablo',value:selectedTable||'—'},{label:'Katalog DB',value:activeServer?.databases?.length||0},{label:'Katalog tablo',value:activeServer?.databases?.reduce((sum,item)=>sum+item.tableCount,0)||0}]} onTooltip={setTooltip}><Database className="h-3 w-3"/> {target}{selectedTable?` / ${selectedTable}`:''}</Metric>
      <Metric title="Grid durumu" description="Aktif tablo görünümündeki sayfalama, filtre ve sıralama." rows={[{label:'Sayfa',value:`${grid.page}/${grid.totalPages}`},{label:'Sayfa boyutu',value:grid.pageSize},{label:'Toplam satır',value:grid.totalRows.toLocaleString('tr-TR')},{label:'Filtre',value:grid.filters},{label:'Sıralama',value:grid.sorts},{label:'Durum',value:grid.isLoading?'Yükleniyor':'Hazır'}]} onTooltip={setTooltip}><Table className="h-3 w-3"/> {grid.page}/{grid.totalPages} • {grid.pageSize}</Metric>
      <Metric title="Bağlantılar ve threadler" description="MySQL/MariaDB bağlantı havuzu ve aktif çalışma bilgileri." rows={[{label:'Bağlı',value:snapshot?.threadsConnected||'—'},{label:'Çalışan',value:snapshot?.threadsRunning||'—'},{label:'En yüksek',value:snapshot?.maxUsedConnections||'—'},{label:'Maksimum',value:snapshot?.maxConnections||'—'},{label:'Reddedilen',value:snapshot?.abortedConnects||'—'}]} onTooltip={setTooltip}><Activity className="h-3 w-3 text-purple-400"/> {snapshot?`${snapshot.threadsConnected} bağlı • ${snapshot.threadsRunning} çalışan`:'Thread —'}</Metric>
      <Metric title="InnoDB buffer pool" description="Bellek havuzu doluluk, dirty page ve hit ratio değerleri." rows={[{label:'Kullanım',value:snapshot?`%${snapshot.bufferPool.usagePercent.toFixed(1)}`:'—'},{label:'Dirty',value:snapshot?`%${snapshot.bufferPool.dirtyPercent.toFixed(1)}`:'—'},{label:'Hit ratio',value:snapshot?.bufferPool.hitRatio==null?'—':`%${snapshot.bufferPool.hitRatio.toFixed(2)}`},{label:'Toplam',value:snapshot?formatBytes(snapshot.bufferPool.totalPages*snapshot.bufferPool.pageSize):'—'}]} onTooltip={setTooltip}><Gauge className="h-3 w-3 text-amber-400"/> Buffer {snapshot?`%${Math.round(snapshot.bufferPool.usagePercent)}`:'—'}</Metric>
      <Metric title="Depolama" description={selectedDatabase?'Seçili veritabanının veri + indeks boyutu. Sunucu toplamı ve InnoDB ayrılmış boş alanı ayrıntılarda gösterilir.':'Katalog/performance metadata üzerinden hesaplanan veritabanı veri + indeks toplamı. Fiziksel disk kapasitesi değildir.'} rows={[
        {label:selectedDatabase?'Seçili DB':'DB toplamı',value:displayedStorageBytes?formatBytes(displayedStorageBytes):'0 B'},
        ...(selectedDatabase?[{label:'Sunucu DB toplamı',value:serverStorageBytes?formatBytes(serverStorageBytes):'0 B'}]:[]),
        {label:'Veri',value:snapshot?formatBytes(snapshot.storage.dataBytes):catalogStorageBytes?formatBytes(catalogStorageBytes):'—'},
        {label:'İndeks',value:snapshot?formatBytes(snapshot.storage.indexBytes):'—'},
        {label:'Ayrılmış boş',value:snapshot?formatBytes(snapshot.storage.freeBytes):'—'},
        {label:'Kaynak',value:snapshot?'Canlı metadata':'Katalog cache'}
      ]} onTooltip={setTooltip}><HardDrive className="h-3 w-3 text-blue-400"/> {displayedStorageBytes?formatBytes(displayedStorageBytes):'0 B'}</Metric>
      <Metric title="Sunucu ağ trafiği" description="Motor açılışından beri alınan ve gönderilen toplam bayt." rows={[{label:'Alınan',value:snapshot?formatBytes(snapshot.bytesReceived):'—'},{label:'Gönderilen',value:snapshot?formatBytes(snapshot.bytesSent):'—'},{label:'Toplam',value:snapshot?formatBytes(snapshot.bytesReceived+snapshot.bytesSent):'—'}]} onTooltip={setTooltip}><Network className="h-3 w-3 text-cyan-400"/><ArrowDown className="h-2.5 w-2.5 text-emerald-400"/>{snapshot?formatBytes(snapshot.bytesReceived):'—'}<ArrowUp className="h-2.5 w-2.5 text-blue-400"/>{snapshot?formatBytes(snapshot.bytesSent):'—'}</Metric>
      <Metric title="SQL istatistikleri" description="Bu uygulama oturumundaki kullanıcı sorgularının başarı ve süre özeti." rows={[{label:'Toplam',value:entries.length},{label:'Başarılı',value:stats.successful,tone:'success'},{label:'Hata',value:stats.errors,tone:stats.errors?'danger':'normal'},{label:'Başarı oranı',value:`%${stats.rate}`},{label:'Ortalama süre',value:`${stats.average} ms`},{label:'Son sorgu',value:stats.last?.durationMs==null?'—':`${stats.last.durationMs} ms`}]} onTooltip={setTooltip}><Terminal className="h-3 w-3"/> {entries.length} SQL • %{stats.rate}</Metric>
      <Metric title="Filtre ve sıralama" description="Aktif veri gridindeki koşul ve sıralama sayısı." rows={[{label:'Filtre',value:grid.filters},{label:'Sıralama',value:grid.sorts},{label:'Yükleme',value:grid.isLoading?'Devam ediyor':'Beklemede'}]} onTooltip={setTooltip}><Filter className="h-3 w-3"/> {grid.filters}<ArrowUpDown className="h-3 w-3"/> {grid.sorts}</Metric>
      <Metric title="Son sorgu" description="En son çalıştırılan kullanıcı SQL işlemi." rows={[{label:'Zaman',value:stats.last?formatDate(stats.last.timestamp):'—'},{label:'Sunucu',value:stats.last?.serverName||'—'},{label:'Hedef',value:stats.last?.databaseName||'sunucu geneli'},{label:'Süre',value:stats.last?.durationMs==null?'—':`${stats.last.durationMs} ms`},{label:'Satır',value:stats.last?.rowCount??stats.last?.affectedRows??'—'}]} onTooltip={setTooltip}><Clock className="h-3 w-3"/> {stats.last?.durationMs==null?'Son sorgu —':`${stats.last.durationMs} ms`}</Metric>
    </div></div><div className="shrink-0 border-l border-zinc-800"><LanguageSwitcher placement="inline" /></div></div><MetricTooltip state={tooltip}/>
  </div>;
}
