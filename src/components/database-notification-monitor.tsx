'use client';

import { useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useDesktop } from '@/context/DesktopContext';
import { useAppPreferences } from '@/lib/appPreferences';
import { fetchDatabasePerformanceSnapshot } from '@/lib/databaseWorkbenchApi';
import type { DatabasePerformanceSnapshot } from '@/lib/databaseWorkbenchTypes';
import { databaseEngineFamily } from '@/lib/databaseEngines';
import { getActivitiesServerSnapshot, getActivitiesSnapshot, subscribeActivities } from '@/lib/activityConsole';
import { backupTasks } from '@/lib/databaseAutomation';
import { calculateHealthScore, compareMetric, notificationRuleStore, performanceHistoryStore, type NotificationRule } from '@/lib/decentralizedIntelligence';
import { dispatchCoreorToast, type CoreorToastVariant } from '@/components/ui/coreor-toast';
import { publishCoreorNotification } from '@/lib/notificationStore';
import { useLanguage } from '@/context/LanguageContext';

const COOLDOWN_KEY = 'coreor:notification-cooldowns:v1';

function openArchivedNotification(id: string) {
  window.dispatchEvent(new CustomEvent('coreor:open-notification', { detail: { id } }));
}


function readCooldowns() {
  if (typeof window === 'undefined') return {} as Record<string, number>;
  try { return JSON.parse(sessionStorage.getItem(COOLDOWN_KEY) || '{}') as Record<string, number>; }
  catch { return {}; }
}

function writeCooldowns(value: Record<string, number>) {
  try { sessionStorage.setItem(COOLDOWN_KEY, JSON.stringify(value)); } catch { /* bildirimler ana akışı durdurmaz */ }
}

function metricValue(rule: NotificationRule, snapshot: DatabasePerformanceSnapshot, previous: DatabasePerformanceSnapshot | null, healthScore: number) {
  switch (rule.metric) {
    case 'connection-percent': return snapshot.maxConnections ? snapshot.threadsConnected / snapshot.maxConnections * 100 : 0;
    case 'running-threads': return snapshot.threadsRunning;
    case 'slow-query-delta': return previous ? Math.max(0, snapshot.slowQueries - previous.slowQueries) : 0;
    case 'buffer-usage': return snapshot.bufferPool.usagePercent;
    case 'replication-lag': return snapshot.replication.secondsBehind ?? 0;
    case 'health-score': return healthScore;
    case 'server-unreachable': return 0;
  }
}

function ruleDescription(rule: NotificationRule, value: number, language: string, t:(key:string,values?:Record<string,string|number>)=>string) {
  const formatted = Number.isInteger(value) ? value.toLocaleString(language) : value.toLocaleString(language, { maximumFractionDigits: 2 });
  const unit = rule.metric.includes('percent') || rule.metric === 'buffer-usage' || rule.metric === 'health-score' ? '%' : rule.metric === 'replication-lag' ? ` ${t('common.secondsShort')}` : '';
  return t('notificationMonitor.ruleDescription',{name:rule.name,value:`${formatted}${unit}`,operator:rule.operator,threshold:rule.threshold});
}

export function DatabaseNotificationMonitor() {
  const { workspaceKey } = useDesktop();
  const {t,language,formatDate}=useLanguage();
  const { preferences } = useAppPreferences();
  const { servers, activeServerId } = useContext(DatabaseContext)!;
  const activities = useSyncExternalStore(subscribeActivities, getActivitiesSnapshot, getActivitiesServerSnapshot);
  const server = servers.find(item => item.id === activeServerId) || null;
  const previousSnapshotRef = useRef<DatabasePerformanceSnapshot | null>(null);
  const lastActivityIdRef = useRef<string | null>(null);
  const activityReadyRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => { previousSnapshotRef.current = null; }, [activeServerId]);

  useEffect(() => {
    const latest = activities.at(-1);
    if (!activityReadyRef.current) {
      activityReadyRef.current = true;
      lastActivityIdRef.current = latest?.id || null;
      return;
    }
    if (!preferences.liveNotifications || !latest || latest.id === lastActivityIdRef.current) return;
    lastActivityIdRef.current = latest.id;
    if (latest.level === 'error') {
      const archived = publishCoreorNotification({
        id: `activity-${latest.id}`,
        severity: 'error',
        source: 'sql',
        title: latest.title || t('notificationMonitor.sqlFailed'),
        description: latest.message || t('notificationMonitor.databaseOperationFailed'),
        serverId: latest.serverId,
        serverName: latest.serverName,
        databaseName: latest.databaseName,
        tableName: latest.tableName,
        code: latest.errorCode || 'DATABASE_ERROR',
        durationMs: latest.durationMs,
        sql: latest.sql,
        statementStartLine: latest.statementStartLine,
        errorLine: latest.errorLine,
        errorColumn: latest.errorColumn,
        statementIndex: latest.statementIndex,
        statementCount: latest.statementCount,
        metadata: [
          { label: t('notificationMonitor.server'), value: latest.serverName || '—' },
          { label: t('notificationMonitor.target'), value: latest.databaseName || 'sunucu geneli' },
          { label: t('notificationMonitor.duration'), value: latest.durationMs === undefined ? '—' : `${latest.durationMs} ms` },
          { label: t('notificationCenter.code'), value: latest.errorCode || 'DATABASE_ERROR' }
        ]
      });
      dispatchCoreorToast({
        id: `toast-${archived.id}`,
        variant: 'error',
        title: archived.title,
        description: archived.description,
        duration: 6500,
        metadata: archived.metadata,
        onOpen: () => openArchivedNotification(archived.id)
      });
      return;
    }
    const queryDurationMs = latest.timings?.queryRoundTripMs;
    if (typeof queryDurationMs === 'number' && queryDurationMs >= 1500) {
      const timing = latest.timings;
      const pool = timing?.pool;
      const archived = publishCoreorNotification({
        id: `slow-${latest.id}`,
        severity: 'warning',
        source: 'sql',
        title: t('notificationMonitor.slowSqlDetected'),
        description: latest.title || latest.sql.replace(/\s+/g, ' ').slice(0, 160),
        serverId: latest.serverId,
        serverName: latest.serverName,
        databaseName: latest.databaseName,
        tableName: latest.tableName,
        code: 'SLOW_SQL',
        durationMs: queryDurationMs,
        sql: latest.sql,
        statementStartLine: latest.statementStartLine,
        statementIndex: latest.statementIndex,
        statementCount: latest.statementCount,
        metadata: [
          { label: t('notificationMonitor.server'), value: latest.serverName || '—' },
          { label: t('notificationMonitor.queryRoundTrip'), value: `${queryDurationMs.toFixed(1)} ms` },
          { label: t('notificationMonitor.poolAcquire'), value: timing?.acquireMs === undefined ? '—' : `${timing.acquireMs.toFixed(1)} ms` },
          { label: t('notificationMonitor.fetchDecode'), value: timing?.fetchDecodeMs === undefined ? '—' : `${timing.fetchDecodeMs.toFixed(1)} ms` },
          { label: t('notificationMonitor.clientOverhead'), value: timing?.clientOverheadMs === undefined ? '—' : `${timing.clientOverheadMs.toFixed(1)} ms` },
          { label: t('notificationMonitor.totalDuration'), value: timing?.totalMs === undefined ? (latest.durationMs === undefined ? '—' : `${latest.durationMs} ms`) : `${timing.totalMs.toFixed(1)} ms` },
          { label: t('notificationMonitor.poolState'), value: pool ? `${pool.inUse} / ${pool.total} • idle ${pool.idle} • wait ${pool.waiters}` : '—' },
          { label: t('notificationMonitor.rows'), value: latest.rowCount ?? latest.affectedRows ?? '—' }
        ]
      });
      dispatchCoreorToast({
        id: `toast-${archived.id}`,
        variant: 'warning',
        title: archived.title,
        description: archived.description,
        duration: 5200,
        metadata: archived.metadata,
        onOpen: () => openArchivedNotification(archived.id)
      });
    }
  }, [activities, preferences.liveNotifications]);

  useEffect(() => {
    if (!preferences.liveNotifications || !server || !workspaceKey || databaseEngineFamily(server.databaseType) !== 'mysql') return;
    let cancelled = false;

    const evaluate = async () => {
      if (runningRef.current || cancelled || document.visibilityState !== 'visible') return;
      runningRef.current = true;
      const rules = notificationRuleStore.list().filter(rule => rule.enabled);
      const cooldowns = readCooldowns();
      const now = Date.now();
      try {
        const snapshot = await fetchDatabasePerformanceSnapshot(server.id, workspaceKey, server.databaseName || null);
        if (cancelled) return;
        const previous = previousSnapshotRef.current;
        const elapsed = previous ? Math.max(0.25, (new Date(snapshot.sampledAt).getTime() - new Date(previous.sampledAt).getTime()) / 1000) : Math.max(1, snapshot.uptimeSeconds);
        const delta = (current: number, old: number) => current >= old ? current - old : current;
        const activitiesForServer = getActivitiesSnapshot().filter(item => item.serverId === server.id);
        const lastBackup = backupTasks.list().filter(item => item.serverId === server.id && item.status === 'completed' && item.lastRunAt).sort((left, right) => (right.lastRunAt || '').localeCompare(left.lastRunAt || ''))[0];
        const backupAge = lastBackup?.lastRunAt ? (Date.now() - new Date(lastBackup.lastRunAt).getTime()) / 3600000 : null;
        const health = calculateHealthScore(snapshot, activitiesForServer, backupAge);
        performanceHistoryStore.add({
          id: `${server.id}:${snapshot.sampledAt}`,
          serverId: server.id,
          sampledAt: snapshot.sampledAt,
          qps: previous ? delta(snapshot.questions, previous.questions) / elapsed : snapshot.questions / elapsed,
          slowQueries: snapshot.slowQueries,
          connections: snapshot.threadsConnected,
          running: snapshot.threadsRunning,
          bytesReceived: snapshot.bytesReceived,
          bytesSent: snapshot.bytesSent,
          bufferUsage: snapshot.bufferPool.usagePercent,
          replicationLag: snapshot.replication.secondsBehind,
          storageBytes: snapshot.storage.totalBytes,
          healthScore: health.score
        });

        for (const rule of rules) {
          if (rule.metric === 'server-unreachable') continue;
          const value = metricValue(rule, snapshot, previous, health.score);
          if (!compareMetric(value, rule.operator, rule.threshold)) continue;
          const key = `${server.id}:${rule.id}`;
          const lastShown = cooldowns[key] || 0;
          if (now - lastShown < Math.max(30, rule.cooldownSeconds) * 1000) continue;
          cooldowns[key] = now;
          const archived = publishCoreorNotification({
            id: `alert-${key}-${snapshot.sampledAt}`,
            severity: rule.severity as CoreorToastVariant,
            source: 'performance',
            title: rule.name,
            description: ruleDescription(rule, value, language, t),
            serverId: server.id,
            serverName: server.name,
            databaseName: server.databaseName || undefined,
            code: rule.metric,
            metadata: [
              { label: t('notificationMonitor.server'), value: server.name },
              { label: t('notificationMonitor.engine'), value: server.databaseType || 'mysql' },
              { label: t('notificationMonitor.measurement'), value: formatDate(snapshot.sampledAt,{timeStyle:'medium'}) },
              { label: t('notificationMonitor.health'), value: `${health.score}/100` }
            ]
          });
          dispatchCoreorToast({
            id: `toast-${archived.id}`,
            variant: rule.severity as CoreorToastVariant,
            title: archived.title,
            description: archived.description,
            duration: 6000,
            metadata: archived.metadata,
            onOpen: () => openArchivedNotification(archived.id)
          });
        }
        previousSnapshotRef.current = snapshot;
        writeCooldowns(cooldowns);
      } catch (error) {
        const unreachableRule = rules.find(rule => rule.metric === 'server-unreachable');
        if (unreachableRule) {
          const key = `${server.id}:${unreachableRule.id}`;
          const lastShown = cooldowns[key] || 0;
          if (now - lastShown >= Math.max(30, unreachableRule.cooldownSeconds) * 1000) {
            cooldowns[key] = now;
            writeCooldowns(cooldowns);
            const archived = publishCoreorNotification({
              id: `unreachable-${key}-${now}`,
              severity: unreachableRule.severity as CoreorToastVariant,
              source: 'connection',
              title: unreachableRule.name,
              description: error instanceof Error ? error.message : String(error || t('notificationMonitor.serverStatusFailed')),
              serverId: server.id,
              serverName: server.name,
              code: 'SERVER_UNREACHABLE',
              metadata: [{ label: t('notificationMonitor.server'), value: server.name }, { label: t('notificationMonitor.target'), value: `${server.host}:${server.port}` }]
            });
            dispatchCoreorToast({
              id: `toast-${archived.id}`,
              variant: unreachableRule.severity as CoreorToastVariant,
              title: archived.title,
              description: archived.description,
              duration: 8000,
              metadata: archived.metadata,
              onOpen: () => openArchivedNotification(archived.id)
            });
          }
        }
      } finally {
        runningRef.current = false;
      }
    };

    const onVisibility = () => { if (document.visibilityState === 'visible') void evaluate(); };
    void evaluate();
    const timer = window.setInterval(() => void evaluate(), Math.max(3, preferences.performanceRefreshSeconds) * 1000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [preferences.liveNotifications, preferences.performanceRefreshSeconds, server, workspaceKey]);

  return null;
}
