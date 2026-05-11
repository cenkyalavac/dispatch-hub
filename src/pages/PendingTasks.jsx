import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Clock, Search, AlertCircle, Globe2, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import TaskDetailCard from '@/components/pending/TaskDetailCard';

function exportToCsv(tasks) {
  const headers = [
    'ID', 'Task Name', 'Project', 'Source Lang', 'Target Lang',
    'Words', 'Min USD', 'Max USD', 'Due Date', 'Created At',
    'Workflow', 'Service Tag', 'Task Type', 'CAT Tool', 'Assigned To',
    'Finance Rows Count', 'Billing Units'
  ];

  const rows = tasks.map(t => [
    t.id,
    `"${(t.name || '').replace(/"/g, '""')}"`,
    `"${(t.project_name || '').replace(/"/g, '""')}"`,
    t.source_language,
    t.target_language,
    t.word_count || 0,
    t.price_min_usd?.toFixed(2) || '0.00',
    t.price_max_usd?.toFixed(2) || '0.00',
    t.due_date ? new Date(t.due_date).toISOString() : '',
    t.created_at ? new Date(t.created_at).toISOString() : '',
    `"${(t.workflow_name || '').replace(/"/g, '""')}"`,
    `"${(t.service_tag || '').replace(/"/g, '""')}"`,
    `"${(t.task_type || '').replace(/"/g, '""')}"`,
    `"${(t.cat_tool || '').replace(/"/g, '""')}"`,
    `"${(t.assigned_to || '').replace(/"/g, '""')}"`,
    t.finance_rows?.length || 0,
    `"${(t.finance_summary?.billing_units || []).join(', ')}"`,
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pending_tasks_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function PendingTasks() {
  const [search, setSearch] = useState('');
  const [acceptingIds, setAcceptingIds] = useState(new Set());

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['symfonie-pending-tasks'],
    queryFn: async () => {
      const res = await base44.functions.invoke('symfonieGetTasks', {});
      return res.data;
    },
    staleTime: 60_000,
    retry: false,
  });

  const tasks = data?.tasks || [];

  const filtered = tasks.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.name?.toLowerCase().includes(q) ||
      t.project_name?.toLowerCase().includes(q) ||
      t.source_language?.toLowerCase().includes(q) ||
      t.target_language?.toLowerCase().includes(q) ||
      t.workflow_name?.toLowerCase().includes(q) ||
      t.service_tag?.toLowerCase().includes(q) ||
      String(t.id).includes(q)
    );
  });

  const handleRefresh = () => {
    refetch();
    toast.info('Yenileniyor...');
  };

  const handleManualAccept = async (task) => {
    setAcceptingIds(prev => new Set([...prev, task.id]));
    try {
      const res = await base44.functions.invoke('symfonieAcceptTask', {
        task_id: task.id,
        task_name: task.name,
        project_name: task.project_name,
        source_language: task.source_language,
        target_language: task.target_language,
        word_count: task.word_count,
        price: task.price_max_usd,
        due_date: task.due_date,
      });
      if (res.data?.success) {
        toast.success(`"${task.name}" kabul edildi`);
        refetch();
      } else {
        toast.error(res.data?.error || 'Kabul başarısız');
      }
    } catch (err) {
      toast.error('Hata: ' + err.message);
    } finally {
      setAcceptingIds(prev => { const s = new Set(prev); s.delete(task.id); return s; });
    }
  };

  const totalWords = tasks.reduce((s, t) => s + (t.word_count || 0), 0);
  const totalMaxUsd = tasks.reduce((s, t) => s + (t.price_max_usd || 0), 0);
  const totalMinUsd = tasks.reduce((s, t) => s + (t.price_min_usd || 0), 0);

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pending Tasks</h1>
          <p className="text-muted-foreground text-sm mt-1">
            <Badge variant="outline" className="text-xs mr-1">Order</Badge>
            durumundaki görevler — kabul veya reddi bekleniyor
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => exportToCsv(filtered)}
            disabled={filtered.length === 0}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            CSV İndir
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={isFetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {!isLoading && !isError && tasks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-card rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Toplam Görev</p>
            <p className="text-2xl font-bold mt-1">{tasks.length}</p>
          </div>
          <div className="bg-card rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Toplam Kelime</p>
            <p className="text-2xl font-bold mt-1">{totalWords.toLocaleString()}</p>
          </div>
          <div className="bg-card rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Min Gelir (USD)</p>
            <p className="text-2xl font-bold mt-1 text-muted-foreground">${totalMinUsd.toFixed(2)}</p>
          </div>
          <div className="bg-card rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Maks Gelir (USD)</p>
            <p className="text-2xl font-bold mt-1 text-primary">${totalMaxUsd.toFixed(2)}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Görev, proje, dil, ID ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {!isLoading && !isError && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{filtered.length} / {tasks.length} görev</span>
          </div>
        )}
      </div>

      {isError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-destructive">Görevler yüklenemedi</p>
              <p className="text-xs text-muted-foreground mt-1">{error?.message || 'Bilinmeyen hata'}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-3 gap-2">
                <RefreshCw className="w-3 h-3" /> Tekrar Dene
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-secondary rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Globe2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {tasks.length === 0 ? 'Order durumunda görev yok' : 'Aramanızla eşleşen görev yok'}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(task => (
            <TaskDetailCard
              key={task.id}
              task={task}
              accepting={acceptingIds.has(task.id)}
              onAccept={handleManualAccept}
            />
          ))}
        </div>
      )}
    </div>
  );
}