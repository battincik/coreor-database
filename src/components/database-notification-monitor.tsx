'use client';

import { useContext, useEffect, useRef } from 'react';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useAuth } from '@/context/AuthContext';
import { useAppPreferences } from '@/lib/appPreferences';
import { fetchDatabasePerformanceSnapshot } from '@/lib/databaseWorkbenchApi';
import { databaseEngineFamily } from '@/lib/databaseEngines';
import { getActivitiesSnapshot } from '@/lib/activityConsole';
import { backupTasks } from '@/lib/databaseAutomation';
import {
  calculateHealthScore,
  compareMetric,
  notificationRuleStore,
  performanceHistoryStore,
  type NotificationRule
} from '@/lib/decentralizedIntelligence';
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

function metricValue(rule: NotificationRule, snapshot: Awaited<ReturnType<typeof fetchDatabasePerformanceSnapshot>>, previousSlow: number | null, healthScore: number) {
  switch (rule.metric) {
    case 'connection-percent': return snapshot.maxConnections ? snapshot.threadsConnected / snapshot.maxConnections * 100 : 0;
    case 'running-threads': return snapshot.threadsRunning;
    case 'slow-query-delta': return previousSlow === null ? 0 : Math.max(0, snapshot.slowQueries - previousSlow);
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
  const { activeToken } = useAuth();
  const { preferences } = useAppPreferences();
  const { servers, activeServerId } = useContext(DatabaseContext)!;
  const server = servers.find(item => item.id === activeServerId) || null;
  const previousSlowRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    previousSlowRef.current = null;
  }, [activeServerId]);

  useEffect(() => {
    if (!preferences.liveNotifications || !server || !activeToken || databaseEngineFamily(server.databaseType) !== 'mysql') return;
    let cancelled = false;

    const evaluate = async () => {
      if (runningRef.current || cancelled) return;
      runningRef.current = true;
      const rules = notificationRuleStore.list().filter(rule => rule.enabled);
      const cooldowns = readCooldowns();
      const now = Date.now();
      try {
        const snapshot = await fetchDatabasePerformanceSnapshot(server.id, activeToken, server.databaseName || null);
        if (cancelled) return;
        const activities = getActivitiesSnapshot().filter(item => item.serverId === server.id);
        const lastBackup = backupTasks.list().filter(item => item.serverId === server.id && item.status === 'completed' && item.lastRunAt).sort((left, right) => (right.lastRunAt || '').localeCompare(left.lastRunAt || ''))[0];
        const backupAge = lastBackup?.lastRunAt ? (Date.now() - new Date(lastBackup.lastRunAt).getTime()) / 3600000 : null;
        const health = calculateHealthScore(snapshot, activities, backupAge);
        const elapsed = previousSlowRef.current === null ? Math.max(1, snapshot.uptimeSeconds) : preferences.performanceRefreshSeconds;
        const qps = previousSlowRef.current === null ? snapshot.questions / elapsed : 0;
        performanceHistoryStore.add({
          id: `${server.id}:${snapshot.sampledAt}`,
          serverId: server.id,
          sampledAt: snapshot.sampledAt,
          qps,
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
          const value = metricValue(rule, snapshot, previousSlowRef.current, health.score);
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
        previousSlowRef.current = snapshot.slowQueries;
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

    void evaluate();
    const timer = window.setInterval(() => void evaluate(), preferences.performanceRefreshSeconds * 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [preferences.liveNotifications, preferences.performanceRefreshSeconds, server, activeToken]);

  return null;
}
