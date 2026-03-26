'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCcw, Server, Wrench } from 'lucide-react';

interface SchedulerSchedule {
  id: string;
  agent_id: string;
  message: string;
  cron_expression: string;
  is_active: boolean;
  next_run_time: string | null;
  last_run_at: string | null;
  last_run_success: boolean | null;
}

interface SchedulerExecution {
  id: string;
  schedule_id: string;
  executed_at: string;
  success: boolean;
  error_message: string | null;
  response_output: string;
}

type HealthStatus = 'connected' | 'degraded' | 'error';

type SchedulerApiPayload = {
  success?: boolean;
  provider?: string;
  code?: string;
  error?: string;
  actionable?: string;
  details?: unknown;
  schedules?: SchedulerSchedule[];
  executions?: SchedulerExecution[];
  total?: number;
};

function formatDate(dateLike: string | null | undefined) {
  if (!dateLike) return '—';
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function mapSchedulerError(payload: SchedulerApiPayload | null, status: number): string {
  if (!payload) return 'The scheduler endpoint returned an empty response. Verify the scheduler service is enabled.';

  if (payload.actionable) return String(payload.actionable);

  if (status === 401) {
    return 'Session expired or unauthorized request. Sign in again and retry the scheduler action.';
  }

  switch (payload.code) {
    case 'SCHEDULE_NOT_FOUND':
      return 'Schedule not found. Refresh schedules and retry with a valid schedule.';
    case 'SCHEDULER_VALIDATION_ERROR':
      return 'Invalid scheduler request. Review selected filters/inputs and try again.';
    case 'SCHEDULE_ALREADY_ACTIVE':
    case 'SCHEDULE_ALREADY_INACTIVE':
      return 'The selected schedule is already in the requested state. Refresh to sync latest status.';
    case 'SCHEDULER_PROVIDER_ERROR':
      return 'Scheduler provider is unavailable. Retry in a moment or switch provider configuration.';
    case 'SCHEDULER_INTERNAL_ERROR':
      return 'Internal scheduler error. Inspect server logs and retry after the service stabilizes.';
    default:
      return payload.error || 'Scheduler request failed. Please retry or check environment configuration.';
  }
}

export default function SchedulerSection() {
  const [provider, setProvider] = useState<'Lyzr' | 'Local' | 'Unknown'>('Unknown');
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('connected');
  const [schedules, setSchedules] = useState<SchedulerSchedule[]>([]);
  const [recentRuns, setRecentRuns] = useState<SchedulerExecution[]>([]);
  const [logsRuns, setLogsRuns] = useState<SchedulerExecution[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [failedOnly, setFailedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryingScheduleId, setRetryingScheduleId] = useState('');

  const providerNote = useMemo(() => {
    if (provider === 'Local') {
      return 'Local mode executes jobs internally on this app instance and does not require external scheduler API keys.';
    }
    if (provider === 'Lyzr') {
      return 'Lyzr mode executes through the hosted scheduler provider and depends on scheduler provider connectivity.';
    }
    return 'Provider has not been detected yet.';
  }, [provider]);

  const loadSchedulerState = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setErrorMessage('');
    let degraded = false;

    try {
      const listRes = await fetch('/api/scheduler?action=list&limit=50', { cache: 'no-store' });
      const listJson: SchedulerApiPayload = await listRes.json();

      if (!listRes.ok || !listJson.success) {
        setHealthStatus('error');
        setErrorMessage(mapSchedulerError(listJson, listRes.status));
        setSchedules([]);
        setRecentRuns([]);
        setLogsRuns([]);
        return;
      }

      setProvider(listJson.provider === 'lyzr' ? 'Lyzr' : listJson.provider === 'local' ? 'Local' : 'Unknown');
      const loadedSchedules = Array.isArray(listJson.schedules) ? listJson.schedules : [];
      setSchedules(loadedSchedules);

      const recentUrl = failedOnly
        ? '/api/scheduler?action=recent&success=false&limit=50'
        : '/api/scheduler?action=recent&limit=50';
      const recentRes = await fetch(recentUrl, { cache: 'no-store' });
      const recentJson: SchedulerApiPayload = await recentRes.json();

      if (!recentRes.ok || !recentJson.success) {
        degraded = true;
        setRecentRuns([]);
        setErrorMessage(mapSchedulerError(recentJson, recentRes.status));
      } else {
        setRecentRuns(Array.isArray(recentJson.executions) ? recentJson.executions : []);
      }

      const focusScheduleId = selectedScheduleId || loadedSchedules[0]?.id;
      if (focusScheduleId) {
        if (!selectedScheduleId) setSelectedScheduleId(focusScheduleId);
        const logsRes = await fetch(`/api/scheduler?action=logs&scheduleId=${focusScheduleId}&limit=25`, { cache: 'no-store' });
        const logsJson: SchedulerApiPayload = await logsRes.json();

        if (!logsRes.ok || !logsJson.success) {
          degraded = true;
          setLogsRuns([]);
          setErrorMessage((existing) => existing || mapSchedulerError(logsJson, logsRes.status));
        } else {
          const executionLogs = Array.isArray(logsJson.executions) ? logsJson.executions : [];
          setLogsRuns(failedOnly ? executionLogs.filter((run) => !run.success) : executionLogs);
        }
      } else {
        setLogsRuns([]);
      }

      const hasRecentFailures = (Array.isArray(recentJson.executions) ? recentJson.executions : []).some((run) => !run.success);
      setHealthStatus(degraded ? 'degraded' : hasRecentFailures ? 'degraded' : 'connected');
    } catch {
      setHealthStatus('error');
      setErrorMessage('Could not connect to scheduler endpoints. Confirm scheduler API routes are available.');
      setSchedules([]);
      setRecentRuns([]);
      setLogsRuns([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [failedOnly, selectedScheduleId]);

  useEffect(() => {
    loadSchedulerState();
  }, [loadSchedulerState]);

  const handleRetry = async (scheduleId: string) => {
    setRetryingScheduleId(scheduleId);
    setErrorMessage('');

    try {
      const response = await fetch('/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger', scheduleId }),
      });
      const payload: SchedulerApiPayload = await response.json();

      if (!response.ok || !payload.success) {
        setErrorMessage(mapSchedulerError(payload, response.status));
      } else {
        await loadSchedulerState(true);
      }
    } catch {
      setErrorMessage('Failed to retry schedule execution. Check network/API availability and try again.');
    } finally {
      setRetryingScheduleId('');
    }
  };

  const failedCount = recentRuns.filter((run) => !run.success).length;
  const lastSuccess = recentRuns.find((run) => run.success)?.executed_at ?? null;
  const nextRun = schedules
    .filter((schedule) => schedule.next_run_time)
    .sort((a, b) => new Date(a.next_run_time as string).getTime() - new Date(b.next_run_time as string).getTime())[0]?.next_run_time ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground tracking-wider">Loading scheduler status...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl tracking-wider">Scheduler Control Center</h2>
          <p className="text-sm text-muted-foreground mt-1">Provider health, upcoming runs, failures, and retry actions.</p>
        </div>
        <Button
          variant="outline"
          className="text-xs uppercase tracking-wider"
          onClick={() => loadSchedulerState(true)}
          disabled={refreshing}
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} 
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-serif text-base tracking-wider flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            Runtime Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-3">
            <Badge variant="secondary">Provider: {provider}</Badge>
            <Badge variant={healthStatus === 'connected' ? 'default' : 'secondary'}>
              Health: {healthStatus}
            </Badge>
            <Badge variant="outline">Failures: {failedCount}</Badge>
          </div>
          <p className="text-muted-foreground">{providerNote}</p>
          <div className="grid gap-2 text-xs text-muted-foreground">
            <p><span className="text-foreground">Last successful run:</span> {formatDate(lastSuccess)}</p>
            <p><span className="text-foreground">Next scheduled run:</span> {formatDate(nextRun)}</p>
          </div>
          {errorMessage && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="font-serif text-base tracking-wider">Recent Executions</CardTitle>
            <Button
              variant={failedOnly ? 'default' : 'outline'}
              className="text-xs uppercase tracking-wider"
              onClick={() => setFailedOnly((value) => !value)}
            >
              {failedOnly ? 'Showing failed only' : 'Filter failed runs'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentRuns.length === 0 && <p className="text-sm text-muted-foreground">No executions available for this filter.</p>}
          {recentRuns.slice(0, 8).map((run) => (
            <div key={run.id} className="border border-border p-3 text-xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-foreground">{formatDate(run.executed_at)}</p>
                <p className="text-muted-foreground">Schedule {run.schedule_id}</p>
                {!run.success && run.error_message && <p className="text-destructive mt-1">{run.error_message}</p>}
              </div>
              <div className="flex items-center gap-2">
                {run.success ? (
                  <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Success</Badge>
                ) : (
                  <Badge variant="destructive">Failed</Badge>
                )}
                {!run.success && (
                  <Button
                    size="sm"
                    className="h-7 text-[10px] uppercase tracking-wider"
                    onClick={() => handleRetry(run.schedule_id)}
                    disabled={retryingScheduleId === run.schedule_id}
                  >
                    {retryingScheduleId === run.schedule_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />} 
                    <span className="ml-1">Retry</span>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-serif text-base tracking-wider">Schedule Logs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {schedules.map((schedule) => (
              <Button
                key={schedule.id}
                variant={selectedScheduleId === schedule.id ? 'secondary' : 'outline'}
                className="h-7 text-[10px] uppercase tracking-wider"
                onClick={() => setSelectedScheduleId(schedule.id)}
              >
                {schedule.id.slice(0, 8)}
              </Button>
            ))}
          </div>
          {logsRuns.length === 0 && <p className="text-sm text-muted-foreground">No logs for the selected schedule/filter.</p>}
          {logsRuns.slice(0, 8).map((run) => (
            <div key={run.id} className="border border-border p-3 text-xs">
              <div className="flex items-center justify-between">
                <p className="text-foreground">{formatDate(run.executed_at)}</p>
                <Badge variant={run.success ? 'secondary' : 'destructive'}>{run.success ? 'Success' : 'Failed'}</Badge>
              </div>
              {!run.success && <p className="text-destructive mt-1">{run.error_message || 'Run failed without detailed error.'}</p>}
              {run.response_output && <p className="text-muted-foreground mt-1 truncate">{run.response_output}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
