import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock, Play, RefreshCw, TrendingUp, AlertCircle, Globe, ThumbsUp, TableProperties } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';


const PORTAL_FUNCTIONS = {
  symfonie: 'symfonieProcessTasks',
};

function StatCard({ title, value, icon: Icon, color, sub }) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [selectedPortal, setSelectedPortal] = useState('symfonie');
  const [acceptingIds, setAcceptingIds] = useState(new Set());
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: portals = [] } = useQuery({
    queryKey: ['portals'],
    queryFn: () => base44.entities.Portal.filter({ is_active: true }),
  });

  const { data: tasks = [], refetch } = useQuery({
    queryKey: ['accepted-tasks', selectedPortal],
    queryFn: () =>
      selectedPortal === 'all'
        ? base44.entities.AcceptedTask.list('-accepted_at', 20)
        : base44.entities.AcceptedTask.filter({ portal: selectedPortal }, '-accepted_at', 20),
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['rules', selectedPortal],
    queryFn: () =>
      selectedPortal === 'all'
        ? base44.entities.Rule.filter({ is_active: true })
        : base44.entities.Rule.filter({ is_active: true, portal: selectedPortal }),
  });

  const accepted = tasks.filter(t => t.status === 'accepted').length;
  const rejected = tasks.filter(t => t.status === 'rejected').length;
  const unsyncedCount = tasks.filter(t => t.status === 'accepted' && !t.sheets_synced).length;
  const syncedCount = tasks.filter(t => t.status === 'accepted' && t.sheets_synced).length;

  const handleManualAccept = async (task) => {
    setAcceptingIds(prev => new Set([...prev, task.id]));
    try {
      const res = await base44.functions.invoke('symfonieAcceptTask', {
        task_id: task.id,
        task_name: task.name || task.task_name,
        project_name: task.project_name,
        source_language: task.source_language,
        target_language: task.target_language,
        word_count: task.word_count,
        price: task.price,
        due_date: task.due_date,
      });
      if (res.data?.success) {
        toast.success(`"${task.name}" accepted`);
        // Remove from skipped list
        setLastResult(prev => ({
          ...prev,
          details: {
            ...prev.details,
            skipped: prev.details.skipped.filter(s => s.id !== task.id)
          },
          summary: {
            ...prev.summary,
            skipped: (prev.summary?.skipped || 1) - 1,
            accepted: (prev.summary?.accepted || 0) + 1,
          }
        }));
        refetch();
      } else {
        toast.error(res.data?.error || 'Acceptance failed');
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setAcceptingIds(prev => { const s = new Set(prev); s.delete(task.id); return s; });
    }
  };

  const handleSyncSheets = async () => {
    setIsSyncing(true);
    try {
      const res = await base44.functions.invoke('sheetsSyncPending', {});
      if (res.data?.success) {
        toast.success(`${res.data.synced} tasks exported to Google Sheets`);
        refetch();
      } else {
        toast.error(res.data?.error || 'Sync failed');
      }
    } catch (err) {
      toast.error('Sheets sync error: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRun = async () => {
    const fnName = PORTAL_FUNCTIONS[selectedPortal];
    if (!fnName) {
      toast.error(`No backend function configured for portal "${selectedPortal}".`);
      return;
    }
    setIsRunning(true);
    try {
      const res = await base44.functions.invoke(fnName, {});
      const result = res.data;
      setLastResult(result);
      if (result.success) {
        toast.success(`Done: ${result.summary.accepted} accepted, ${result.summary.rejected} rejected`);
        refetch();
      } else {
        toast.error(result.error || 'Operation failed');
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Automation hub overview</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedPortal} onValueChange={setSelectedPortal}>
            <SelectTrigger className="w-48">
              <Globe className="w-4 h-4 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Portals</SelectItem>
              {portals.map(p => (
                <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleSyncSheets}
            disabled={isSyncing}
            variant="outline"
            className="gap-2"
            title="Export all accepted tasks with sheets_synced=false to Sheets"
          >
            {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TableProperties className="w-4 h-4" />}
            {isSyncing ? 'Syncing...' : 'Sync to Sheets'}
          </Button>
          <Button
            onClick={handleRun}
            disabled={isRunning || selectedPortal === 'all'}
            className="gap-2 bg-primary hover:bg-primary/90"
            title={selectedPortal === 'all' ? 'Select a portal to run' : ''}
          >
            {isRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Processing...' : 'Run Manually'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard title="Total Processed" value={tasks.length} icon={TrendingUp} color="bg-accent text-accent-foreground" sub="Selected portal" />
        <StatCard title="Accepted" value={accepted} icon={CheckCircle2} color="bg-green-100 text-green-600" />
        <StatCard title="Rejected" value={rejected} icon={XCircle} color="bg-red-100 text-red-500" />
        <StatCard title="Active Rules" value={rules.length} icon={Clock} color="bg-blue-100 text-blue-600" />
      </div>

      <Card className="mb-6 border-border shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <TableProperties className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Google Sheets Sync Status</p>
                <p className="text-xs text-muted-foreground">
                  Auto-syncs every 5 minutes and immediately when a new task is accepted.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Synced</p>
                <p className="text-lg font-bold text-green-600">{syncedCount}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className={`text-lg font-bold ${unsyncedCount > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>{unsyncedCount}</p>
              </div>
              {unsyncedCount > 0 && (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                  {unsyncedCount} not synced
                </Badge>
              )}
              {unsyncedCount === 0 && syncedCount > 0 && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  All synced ✓
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {lastResult && (
        <Card className="mb-6 border-primary/20 bg-accent/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Last Run Result</span>
            </div>
            <div className="flex gap-4 text-sm mb-3">
              <span className="text-green-600 font-medium">✓ {lastResult.summary?.accepted || 0} Accepted</span>
              <span className="text-red-500 font-medium">✗ {lastResult.summary?.rejected || 0} Rejected</span>
              <span className="text-muted-foreground">⊘ {lastResult.summary?.skipped || 0} Skipped</span>
              {lastResult.summary?.errors > 0 && (
                <span className="text-orange-500 font-medium">⚠ {lastResult.summary.errors} Errors</span>
              )}
            </div>
            {lastResult.details?.skipped?.length > 0 && lastResult.details?.skipped?.some(s => typeof s === 'object') && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground font-medium mb-1">Skipped (no matching rule):</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {lastResult.details.skipped.filter(s => typeof s === 'object').map((s) => (
                    <div key={s.id} className="text-xs bg-background/60 rounded px-2 py-1 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{s.name || s.task_name}</span>
                        {s.source_language && <span className="text-muted-foreground ml-2">{s.source_language} → {s.target_language}</span>}
                        {s.project_name && <span className="text-muted-foreground ml-2">· {s.project_name}</span>}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs text-green-600 border-green-300 hover:bg-green-50 flex-shrink-0"
                        disabled={acceptingIds.has(s.id)}
                        onClick={() => handleManualAccept(s)}
                      >
                        {acceptingIds.has(s.id) ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3 mr-1" />}
                        {acceptingIds.has(s.id) ? '' : 'Accept'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recently Processed Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No processed tasks yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 10).map((task) => (
                <div key={task.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                  <div className="flex items-center gap-3">
                    {task.status === 'accepted' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{task.task_name}</p>
                        {selectedPortal === 'all' && (
                          <Badge variant="outline" className="text-xs">{task.portal}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {task.project_name} · {task.source_language} → {task.target_language}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    {task.matched_rule && (
                      <Badge variant="outline" className="text-xs hidden sm:flex">{task.matched_rule}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {task.accepted_at ? format(new Date(task.accepted_at), 'dd MMM HH:mm') : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}