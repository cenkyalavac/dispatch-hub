import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Clock, Search, AlertCircle, Globe2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function PendingTasks() {
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['symfonie-pending-tasks'],
    queryFn: async () => {
      const res = await base44.functions.invoke('symfonieGetTasks', {});
      return res.data;
    },
    staleTime: 60_000, // cache for 1 minute
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
      t.workflow_name?.toLowerCase().includes(q)
    );
  });

  const handleRefresh = () => {
    refetch();
    toast.info('Refreshing pending tasks...');
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pending Tasks</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live tasks currently in <Badge variant="outline" className="text-xs mx-1">Order</Badge> state — awaiting Accept or Reject
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isFetching} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Search + stats */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search tasks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {!isLoading && !isError && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{filtered.length} of {tasks.length} tasks</span>
          </div>
        )}
      </div>

      {/* Error state */}
      {isError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-destructive">Failed to load pending tasks</p>
              <p className="text-xs text-muted-foreground mt-1">{error?.message || 'Unknown error'}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-3 gap-2">
                <RefreshCw className="w-3 h-3" /> Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-secondary rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && filtered.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Globe2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {tasks.length === 0
                ? 'No tasks currently in Order state'
                : 'No tasks match your search'}
            </p>
            {tasks.length === 0 && (
              <p className="text-xs mt-1">All tasks have been processed or none are awaiting action.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Task table */}
      {!isLoading && !isError && filtered.length > 0 && (
        <Card className="shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Task Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Project</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Language Pair</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Words</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Price (max USD)</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Workflow</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task, idx) => (
                  <tr
                    key={task.id}
                    className={`border-b hover:bg-secondary/30 transition-colors ${idx % 2 === 1 ? 'bg-secondary/10' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[200px]">{task.name}</p>
                      {task.service_tag && (
                        <p className="text-xs text-muted-foreground">{task.service_tag}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm truncate max-w-[160px] text-muted-foreground">{task.project_name || '-'}</p>
                    </td>
                    <td className="px-4 py-3">
                      {task.source_language || task.target_language ? (
                        <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">
                          {task.source_language} → {task.target_language}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {task.word_count ? task.word_count.toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {task.price > 0 ? `$${task.price.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {task.due_date ? format(new Date(task.due_date), 'dd MMM yyyy HH:mm') : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {task.created_at ? format(new Date(task.created_at), 'dd MMM HH:mm') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {task.workflow_name ? (
                        <Badge variant="outline" className="text-xs">{task.workflow_name}</Badge>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}