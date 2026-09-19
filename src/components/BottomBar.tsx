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
import { BottomBarGuide } from '@/components/bottom-bar-guide';
import { useAppContextMenu } from '@/components/app-context-menu';
import { openQueryTab } from '@/lib/queryWorkspaceEvents';
import { useLanguage } from '@/context/LanguageContext';

interface BottomBarProps { selectedDatabase?: string | null; selectedTable?: string | null }
type ConsoleFilter = 'all' | 'success' | 'errors';
interface TooltipRow { label: string; value: React.ReactNode; tone?: 'normal' | 'success' | 'warning' | 'danger' }
interface TooltipState { title: string; description?: string; rows: TooltipRow[]; x: number; y: number }

const EMPTY_GRID_STATUS: GridRuntimeStatus = { page:1,pageSize:50,totalRows:0,totalPages:1,filters:0,sorts:0,isLoading:false };
const SESSION_KEY = 'coreor:active-connection-session:v1';

function formatBytesBase(value:number,locale:string){if(!Number.isFinite(value)||value<=0)return'0 B';const units=['B','KB','MB','GB','TB','PB'];const index=Math.min(Math.floor(Math.log(value)/Math.log(1024)),units.length-1);const amount=value/1024**index;return`${amount.toLocaleString(locale,{maximumFractionDigits:amount>=100?0:amount>=10?1:2})} ${units[index]}`;}
function formatDurationBase(totalSeconds:number,detailed:boolean,t:(key:string)=>string){const seconds=Math.max(0,Math.floor(totalSeconds));const values=[[Math.floor(seconds/86400),detailed?t('time.dayLong'):t('time.dayShort')],[Math.floor(seconds%86400/3600),detailed?t('time.hourLong'):t('time.hourShort')],[Math.floor(seconds%3600/60),t('time.minuteShort')],[seconds%60,t('time.secondShort')]]as const;const visible=values.filter(([value])=>value>0).slice(0,detailed?4:2);return visible.length?visible.map(([value,unit])=>`${value} ${unit}`).join(' '):`0 ${t('time.secondShort')}`;}
function formatDateBase(value:string|number,locale:string){return new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));}
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
  const{t,language}=useLanguage();
  const formatBytes=(value:number)=>formatBytesBase(value,language);
  const formatDuration=(value:number,detailed=false)=>formatDurationBase(value,detailed,t);
  const formatDate=(value:string|number)=>formatDateBase(value,language);
  const{workspaceKey}=useDesktop();const{servers,activeServerId,isServersLoading}=useContext(DatabaseContext)!;const activeServer=servers.find(server=>server.id===activeServerId)||null;const definition=databaseEngineDefinition(activeServer?.databaseType);const supportsMetrics=activeServer?.databaseType==='mysql'||activeServer?.databaseType==='mariadb';
  const[consoleOpen,setConsoleOpen]=useState(false);const[expandedActivityId,setExpandedActivityId]=useState<string|null>(null);const[filter,setFilter]=useState<ConsoleFilter>('all');const[grid,setGrid]=useState<GridRuntimeStatus>(EMPTY_GRID_STATUS);const[snapshot,setSnapshot]=useState<DatabasePerformanceSnapshot|null>(null);const[snapshotError,setSnapshotError]=useState<string|null>(null);const[loading,setLoading]=useState(false);const[startedAt,setStartedAt]=useState<number|null>(null);const[now,setNow]=useState(Date.now());const[tooltip,setTooltip]=useState<TooltipState|null>(null);const entries=useSyncExternalStore(subscribeActivities,getActivitiesSnapshot,getActivitiesServerSnapshot);const endRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{const handler=(event:Event)=>setGrid((event as CustomEvent<GridRuntimeStatus>).detail||EMPTY_GRID_STATUS);window.addEventListener('coreor:grid-status',handler);return()=>window.removeEventListener('coreor:grid-status',handler);},[]);
  useEffect(()=>{if(!activeServerId){setStartedAt(null);sessionStorage.removeItem(SESSION_KEY);return;}let session:{serverId:string;startedAt:number}|null=null;try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch{}if(!session||session.serverId!==activeServerId){session={serverId:activeServerId,startedAt:Date.now()};sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));}setStartedAt(session.startedAt);},[activeServerId]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(!activeServerId||!workspaceKey||!supportsMetrics){setSnapshot(null);setSnapshotError(activeServer&&!supportsMetrics?t('bottomBar.limitedEngineMetrics', { engine: databaseEngineLabel(activeServer.databaseType) }):null);return;}let disposed=false;const refresh=async()=>{if(disposed||document.visibilityState!=='visible')return;setLoading(true);try{const value=await fetchDatabasePerformanceSnapshot(activeServerId,workspaceKey,selectedDatabase||null);if(!disposed){setSnapshot(value);setSnapshotError(null);}}catch(error){if(!disposed)setSnapshotError(error instanceof Error?error.message:t('bottomBar.metricsUnavailable'));}finally{if(!disposed)setLoading(false);}};const onVisibility=()=>{if(document.visibilityState==='visible')void refresh();};void refresh();const timer=setInterval(()=>void refresh(),30000);document.addEventListener('visibilitychange',onVisibility);return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility);};},[activeServerId,workspaceKey,selectedDatabase,supportsMetrics,activeServer?.databaseType]);
  const filtered=useMemo(()=>filter==='success'?entries.filter(item=>item.level==='success'):filter==='errors'?entries.filter(item=>item.level==='error'||item.level==='warning'):entries,[entries,filter]);
  const openActivityMenu=(event:React.MouseEvent,item:ActivityEntry)=>openContextMenu(event,[
    {id:'open-query',label:t('bottomBar.openInSqlEditor'),icon:Terminal,disabled:!item.sql.trim(),onSelect:()=>openQueryTab({serverId:item.serverId,databaseName:item.databaseName||null,title:item.title||t('bottomBar.sqlLog'),sql:item.sql})},
    {id:'copy-sql',label:t('bottomBar.copySql'),icon:Copy,disabled:!item.sql.trim(),onSelect:()=>navigator.clipboard.writeText(item.sql)},
    {id:'copy-info',label:t('bottomBar.copyRecordSummary'),icon:Copy,onSelect:()=>navigator.clipboard.writeText(`${item.serverName} • ${item.databaseName||t('query.serverScope')} • ${item.durationMs??'—'} ms\n${item.sql}`)},
    {id:'sep-filter',separator:true},
    {id:'filter-success',label:t('bottomBar.successfulOnly'),icon:CheckCircle2,onSelect:()=>setFilter('success')},
    {id:'filter-errors',label:t('bottomBar.warningsErrorsOnly'),icon:XCircle,onSelect:()=>setFilter('errors')},
    {id:'filter-all',label:t('bottomBar.allRecords'),icon:Terminal,onSelect:()=>setFilter('all')}
  ],item.title||t('bottomBar.sqlOperation'));
  const stats=useMemo(()=>{const successful=entries.filter(item=>item.level==='success').length;const errors=entries.filter(item=>item.level==='error').length;const durations=entries.map(item=>item.durationMs).filter((value):value is number=>typeof value==='number');return{successful,errors,rate:successful+errors?Math.round(successful/(successful+errors)*100):100,average:durations.length?Math.round(durations.reduce((sum,value)=>sum+value,0)/durations.length):0,last:entries.at(-1)};},[entries]);
  useEffect(()=>{if(consoleOpen)endRef.current?.scrollIntoView({block:'end'});},[consoleOpen,filtered.length]);
  const connectionSeconds=startedAt?Math.floor((now-startedAt)/1000):0;const target=selectedDatabase||activeServer?.databaseName||t('query.serverScope');
  const catalogStorageBytes=(activeServer?.databases||[]).reduce((sum,database)=>sum+(Number(database.totalSizeMB)||0)*1024*1024,0);
  const selectedCatalogBytes=selectedDatabase?(Number(activeServer?.databases?.find(database=>database.name===selectedDatabase)?.totalSizeMB)||0)*1024*1024:null;
  const serverStorageBytes=snapshot?.storage.totalBytes||catalogStorageBytes;
  const selectedStorageBytes=selectedDatabase?(snapshot?.storage.selectedDatabaseBytes??selectedCatalogBytes):null;
  const displayedStorageBytes=selectedStorageBytes??serverStorageBytes;

  return <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 text-xs">
    <div className={`flex flex-col transition-[height] ${consoleOpen?'h-[212px]':'h-8'}`}><div className="flex h-8 shrink-0 items-center border-b border-zinc-800 px-2"><button className="flex items-center gap-2 text-zinc-300" onClick={()=>setConsoleOpen(value=>!value)}><Terminal className="h-3.5 w-3.5"/>{t('bottomBar.sqlLog')} <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px]">{entries.length}</span>{consoleOpen?<ChevronDown className="h-3 w-3"/>:<ChevronUp className="h-3 w-3"/>}</button>{consoleOpen&&<div className="ml-auto flex items-center gap-1">{(['all','success','errors']as ConsoleFilter[]).map(item=><button key={item} className={`rounded px-2 py-1 text-[9px] ${filter===item?'bg-zinc-800':'text-zinc-600'}`} onClick={()=>setFilter(item)}>{item==='all'?t('common.all'):item==='success'?t('common.success'):t('bottomBar.errors')}</button>)}<Button variant="ghost" size="icon" className="h-6 w-6" onClick={downloadLog}><Download className="h-3.5 w-3.5"/></Button><Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={clearActivities}><Trash2 className="h-3.5 w-3.5"/></Button></div>}</div>{consoleOpen&&<div className="min-h-0 flex-1 overflow-auto font-mono text-[9px]">{filtered.map(item=>{const expanded=expandedActivityId===item.id;return expanded
          ? <div key={item.id} className="border-b border-cyan-500/20 bg-cyan-500/[0.025]">
              <button type="button" onClick={()=>setExpandedActivityId(null)} onContextMenu={event=>openActivityMenu(event,item)} className="grid h-7 w-full grid-cols-[18px_80px_minmax(160px,1fr)_80px] items-center gap-1 px-1 text-left transition hover:bg-white/[0.025]" title={t('bottomBar.collapseOneLine')}>
                <span>{statusIcon(item.level)}</span>
                <span className="text-zinc-600">{new Date(item.timestamp).toLocaleTimeString(language)}</span>
                <span className="truncate text-zinc-400">{item.serverName} • {item.databaseName||t('query.serverScope')}{item.tableName? ` • ${item.tableName}` : ''}</span>
                <span className="text-right text-zinc-600">{item.durationMs??'—'} ms</span>
              </button>
              <button type="button" onClick={()=>setExpandedActivityId(null)} onContextMenu={event=>openActivityMenu(event,item)} className="block w-full border-t border-zinc-900/80 bg-black/25 px-6 py-2 text-left hover:bg-black/35" title={t('bottomBar.collapseOneLine')}>
                <code className="block whitespace-pre-wrap break-words font-mono text-[9px] leading-4 text-cyan-300">{item.sql}</code>
              </button>
            </div>
          : <button type="button" key={item.id} onClick={()=>setExpandedActivityId(item.id)} onContextMenu={event=>openActivityMenu(event,item)} className="grid min-h-5 w-full grid-cols-[18px_80px_190px_minmax(300px,1fr)_80px] items-center border-b border-zinc-900 px-1 text-left transition hover:bg-white/[0.025]" title={t('bottomBar.showFullQuery')}>
              <span>{statusIcon(item.level)}</span>
              <span className="text-zinc-600">{new Date(item.timestamp).toLocaleTimeString(language)}</span>
              <span className="truncate text-zinc-500">{item.serverName} • {item.databaseName||t('query.serverScope')}</span>
              <code className="truncate text-cyan-300">{item.sql.replace(/\s+/g,' ')}</code>
              <span className="text-right text-zinc-600">{item.durationMs??'—'} ms</span>
            </button>;})}<div ref={endRef}/></div>}</div>
    <div className="flex h-8 border-t border-zinc-800 text-[9px] text-zinc-500"><div className="coreor-hide-scrollbar min-w-0 flex-1 overflow-x-auto"><div className="flex h-full min-w-max items-center divide-x divide-zinc-800">
      <Metric title={t('bottomBar.connectionStatus')} description={t('bottomBar.connectionStatusDescription')} rows={[{label:t('maintenance.status'),value:!activeServer?t('bottomBar.serverNotSelected'):snapshotError?t('bottomBar.healthLimited'):t('common.connected'),tone:snapshotError?'warning':'success'},{label:t('bottomBar.engine'),value:activeServer?databaseEngineLabel(activeServer.databaseType):'—'},{label:t('bottomBar.lastCheck'),value:snapshot?.sampledAt?formatDate(snapshot.sampledAt):'—'},{label:t('common.error'),value:snapshotError||t('bottomBar.none')}]} onTooltip={setTooltip}>{loading?<Loader2 className="h-3 w-3 animate-spin"/>:<Wifi className={`h-3 w-3 ${activeServer?'text-emerald-400':'text-zinc-600'}`}/>} {activeServer?t('common.connected'):t('topbar.noConnection')}</Metric>
      <Metric title={t('bottomBar.serverProfile')} description={t('bottomBar.serverProfileDescription')} rows={[{label:t('server.profile'),value:activeServer?.name||'—'},{label:t('bottomBar.engine'),value:definition.label},{label:t('bottomBar.host'),value:activeServer?`${activeServer.host}:${activeServer.port}`:'—'},{label:t('bottomBar.user'),value:activeServer?.username||'—'},{label:t('bottomBar.tls'),value:activeServer?.sslMode||'—'}]} onTooltip={setTooltip}><Server className="h-3 w-3"/> {definition.label}</Metric>
      <Metric title={t('bottomBar.serverUptime')} description={t('bottomBar.serverUptimeDescription')} rows={[{label:t('bottomBar.uptime'),value:snapshot?formatDuration(snapshot.uptimeSeconds,true):'—'},{label:t('bottomBar.totalQueries'),value:snapshot?.questions.toLocaleString(language)||'—'},{label:t('bottomBar.slowQueries'),value:snapshot?.slowQueries.toLocaleString(language)||'—',tone:snapshot?.slowQueries?'warning':'normal'}]} onTooltip={setTooltip}><Timer className="h-3 w-3 text-cyan-400"/> {snapshot?formatDuration(snapshot.uptimeSeconds):t('bottomBar.uptimeEmpty')}</Metric>
      <Metric title={t('bottomBar.coreorConnectionDuration')} description={t('bottomBar.coreorConnectionDescription')} rows={[{label:t('maintenance.duration'),value:activeServer?formatDuration(connectionSeconds,true):'—'},{label:t('bottomBar.startedAt'),value:startedAt?formatDate(startedAt):'—'},{label:t('server.profile'),value:activeServer?.name||'—'}]} onTooltip={setTooltip}><PlugZap className="h-3 w-3 text-emerald-400"/> {activeServer?formatDuration(connectionSeconds):'—'}</Metric>
      <Metric title={t('bottomBar.currentScope')} description={t('bottomBar.currentScopeDescription')} rows={[{label:t('database.database'),value:target},{label:t('database.table'),value:selectedTable||'—'},{label:t('bottomBar.catalogDatabases'),value:activeServer?.databases?.length||0},{label:t('bottomBar.catalogTables'),value:activeServer?.databases?.reduce((sum,item)=>sum+item.tableCount,0)||0}]} onTooltip={setTooltip}><Database className="h-3 w-3"/> {target}{selectedTable?` / ${selectedTable}`:''}</Metric>
      <Metric title={t('bottomBar.gridStatus')} description={t('bottomBar.gridStatusDescription')} rows={[{label:t('bottomBar.page'),value:`${grid.page}/${grid.totalPages}`},{label:t('bottomBar.pageSize'),value:grid.pageSize},{label:t('bottomBar.totalRows'),value:grid.totalRows.toLocaleString(language)},{label:t('bottomBar.filter'),value:grid.filters},{label:t('bottomBar.sorting'),value:grid.sorts},{label:t('maintenance.status'),value:grid.isLoading?t('common.loading'):t('common.ready')}]} onTooltip={setTooltip}><Table className="h-3 w-3"/> {grid.page}/{grid.totalPages} • {grid.pageSize}</Metric>
      <Metric title={t('bottomBar.connectionsThreads')} description={t('bottomBar.connectionsThreadsDescription')} rows={[{label:t('common.connected'),value:snapshot?.threadsConnected||'—'},{label:t('bottomBar.running'),value:snapshot?.threadsRunning||'—'},{label:t('bottomBar.peak'),value:snapshot?.maxUsedConnections||'—'},{label:t('bottomBar.maximum'),value:snapshot?.maxConnections||'—'},{label:t('bottomBar.rejected'),value:snapshot?.abortedConnects||'—'}]} onTooltip={setTooltip}><Activity className="h-3 w-3 text-purple-400"/> {snapshot?`${snapshot.threadsConnected} bağlı • ${snapshot.threadsRunning} çalışan` :t('bottomBar.threadEmpty')}</Metric>
      <Metric title={t('bottomBar.bufferPool')} description={t('bottomBar.bufferPoolDescription')} rows={[{label:t('bottomBar.usage'),value:snapshot?`%${snapshot.bufferPool.usagePercent.toFixed(1)}`:'—'},{label:t('bottomBar.dirty'),value:snapshot?`%${snapshot.bufferPool.dirtyPercent.toFixed(1)}`:'—'},{label:t('bottomBar.hitRatio'),value:snapshot?.bufferPool.hitRatio==null?'—':`%${snapshot.bufferPool.hitRatio.toFixed(2)}`},{label:t('bottomBar.total'),value:snapshot?formatBytes(snapshot.bufferPool.totalPages*snapshot.bufferPool.pageSize):'—'}]} onTooltip={setTooltip}><Gauge className="h-3 w-3 text-amber-400"/> Buffer {snapshot?`%${Math.round(snapshot.bufferPool.usagePercent)}`:'—'}</Metric>
      <Metric title={t('bottomBar.storage')} description={selectedDatabase?t('bottomBar.storageMetricDescription'):t('bottomBar.storageLogicalDescription')} rows={[
        {label:selectedDatabase?t('bottomBar.selectedDatabase'):t('bottomBar.databaseTotal'),value:displayedStorageBytes?formatBytes(displayedStorageBytes):'0 B'},
        ...(selectedDatabase?[{label:t('bottomBar.serverDatabaseTotal'),value:serverStorageBytes?formatBytes(serverStorageBytes):'0 B'}]:[]),
        {label:t('bottomBar.data'),value:snapshot?formatBytes(snapshot.storage.dataBytes):catalogStorageBytes?formatBytes(catalogStorageBytes):'—'},
        {label:t('database.index'),value:snapshot?formatBytes(snapshot.storage.indexBytes):'—'},
        {label:t('bottomBar.allocatedFree'),value:snapshot?formatBytes(snapshot.storage.freeBytes):'—'},
        {label:t('bottomBar.source'),value:snapshot?t('bottomBar.liveMetadata') :t('bottomBar.catalogCache')}
      ]} onTooltip={setTooltip}><HardDrive className="h-3 w-3 text-blue-400"/> {displayedStorageBytes?formatBytes(displayedStorageBytes):'0 B'}</Metric>
      <Metric title={t('bottomBar.networkTraffic')} description={t('bottomBar.networkTrafficDescription')} rows={[{label:t('bottomBar.received'),value:snapshot?formatBytes(snapshot.bytesReceived):'—'},{label:t('bottomBar.sent'),value:snapshot?formatBytes(snapshot.bytesSent):'—'},{label:t('bottomBar.total'),value:snapshot?formatBytes(snapshot.bytesReceived+snapshot.bytesSent):'—'}]} onTooltip={setTooltip}><Network className="h-3 w-3 text-cyan-400"/><ArrowDown className="h-2.5 w-2.5 text-emerald-400"/>{snapshot?formatBytes(snapshot.bytesReceived):'—'}<ArrowUp className="h-2.5 w-2.5 text-blue-400"/>{snapshot?formatBytes(snapshot.bytesSent):'—'}</Metric>
      <Metric title={t('bottomBar.sqlStatistics')} description={t('bottomBar.sqlStatisticsDescription')} rows={[{label:t('bottomBar.total'),value:entries.length},{label:t('common.success'),value:stats.successful,tone:'success'},{label:t('common.error'),value:stats.errors,tone:stats.errors?'danger':'normal'},{label:t('bottomBar.successRate'),value:`%${stats.rate}`},{label:t('bottomBar.averageDuration'),value:`${stats.average} ms`},{label:t('bottomBar.lastQuery'),value:stats.last?.durationMs==null?'—':`${stats.last.durationMs} ms`}]} onTooltip={setTooltip}><Terminal className="h-3 w-3"/> {entries.length} SQL • %{stats.rate}</Metric>
      <Metric title={t('bottomBar.filterSort')} description={t('bottomBar.filterSortDescription')} rows={[{label:t('bottomBar.filter'),value:grid.filters},{label:t('bottomBar.sorting'),value:grid.sorts},{label:t('bottomBar.loadingState'),value:grid.isLoading?t('bottomBar.inProgress'):t('bottomBar.idle')}]} onTooltip={setTooltip}><Filter className="h-3 w-3"/> {grid.filters}<ArrowUpDown className="h-3 w-3"/> {grid.sorts}</Metric>
      <Metric title={t('bottomBar.lastQuery')} description={t('bottomBar.lastUserSqlDescription')} rows={[{label:t('bottomBar.time'),value:stats.last?formatDate(stats.last.timestamp):'—'},{label:t('statusGuide.server'),value:stats.last?.serverName||'—'},{label:t('server.target'),value:stats.last?.databaseName||t('query.serverScope')},{label:t('maintenance.duration'),value:stats.last?.durationMs==null?'—':`${stats.last.durationMs} ms`},{label:t('query.rows'),value:stats.last?.rowCount??stats.last?.affectedRows??'—'}]} onTooltip={setTooltip}><Clock className="h-3 w-3"/> {stats.last?.durationMs==null?t('bottomBar.lastQueryEmpty'):`${stats.last.durationMs} ms`}</Metric>
    </div></div><div className="flex h-full shrink-0 items-stretch border-l border-zinc-800 bg-zinc-950">
      <div className="flex items-center border-r border-zinc-800"><LanguageSwitcher placement="inline" /></div>
      <BottomBarGuide selectedDatabase={selectedDatabase} selectedTable={selectedTable} />
    </div></div><MetricTooltip state={tooltip}/>
  </div>;
}
