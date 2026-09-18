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

const COOLDOWN_KEY = 'coreor:notification-cooldowns:v1';

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

function ruleDescription(rule: NotificationRule, value: number) {
  const formatted = Number.isInteger(value) ? value.toLocaleString('tr-TR') : value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const unit = rule.metric.includes('percent') || rule.metric === 'buffer-usage' || rule.metric === 'health-score' ? '%' : rule.metric === 'replication-lag' ? ' sn' : '';
  return `${rule.name}: ${formatted}${unit}. Tanımlı eşik ${rule.operator} ${rule.threshold}.`;
}

export function DatabaseNotificationMonitor() {
  const { workspaceKey } = useDesktop();
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
      dispatchCoreorToast({
        variant: 'error',
        title: latest.title || 'SQL işlemi başarısız',
        description: latest.message || 'Veritabanı işlemi hata verdi.',
        duration: 9000,
        metadata: [
          { label: 'Sunucu', value: latest.serverName || '—' },
          { label: 'Hedef', value: latest.databaseName || 'sunucu geneli' },
          { label: 'Süre', value: latest.durationMs === undefined ? '—' : `${latest.durationMs} ms` },
          { label: 'Kod', value: latest.errorCode || 'DATABASE_ERROR' }
        ]
      });
      return;
    }
    if ((latest.durationMs || 0) >= 1500) {
      dispatchCoreorToast({
        variant: 'warning',
        title: 'Yavaş SQL işlemi algılandı',
        description: latest.title || latest.sql.replace(/\s+/g, ' ').slice(0, 160),
        duration: 7000,
        metadata: [
          { label: 'Sunucu', value: latest.serverName || '—' },
          { label: 'Süre', value: `${latest.durationMs} ms` },
          { label: 'Satır', value: latest.rowCount ?? latest.affectedRows ?? '—' },
          { label: 'Kaynak', value: 'Yerel SQL günlüğü' }
        ]
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
          dispatchCoreorToast({
            id: `alert-${key}`,
            variant: rule.severity as CoreorToastVariant,
            title: rule.name,
            description: ruleDescription(rule, value),
            duration: 8500,
            metadata: [
              { label: 'Sunucu', value: server.name },
              { label: 'Motor', value: server.databaseType || 'mysql' },
              { label: 'Ölçüm', value: new Date(snapshot.sampledAt).toLocaleTimeString('tr-TR') },
              { label: 'Sağlık', value: `${health.score}/100` }
            ]
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
            dispatchCoreorToast({
              id: `alert-${key}`,
              variant: unreachableRule.severity as CoreorToastVariant,
              title: unreachableRule.name,
              description: error instanceof Error ? error.message : 'Sunucu durumu alınamadı.',
              persistent: true,
              metadata: [{ label: 'Sunucu', value: server.name }, { label: 'Hedef', value: `${server.host}:${server.port}` }]
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
