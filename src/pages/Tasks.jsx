import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, ExternalLink, Search, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

export default function Tasks() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['accepted-tasks-all'],
    queryFn: () => base44.entities.AcceptedTask.list('-accepted_at', 500),
  });

  const filtered = tasks.filter(t => {
    const matchSearch = !search || 
      t.task_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.project_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.client_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">İşlenen Tasklar</h1>
        <p className="text-muted-foreground text-sm mt-1">Kabul ve reddedilen tüm taskların kaydı</p>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Task adı, proje veya müşteri ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="accepted">Kabul Edildi</SelectItem>
            <SelectItem value="rejected">Reddedildi</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-secondary rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="text-sm">Kayıt bulunamadı.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Durum</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Task</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Müşteri</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Dil Çifti</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kelime</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Teslim</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kural</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kabul Tarihi</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sheets</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task, idx) => (
                  <tr key={task.id} className={`border-b hover:bg-secondary/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-secondary/10'}`}>
                    <td className="px-4 py-3">
                      {task.status === 'accepted' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[180px]">{task.task_name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">{task.project_name}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{task.client_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">
                        {task.source_language} → {task.target_language}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{task.word_count || '-'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {task.due_date ? format(new Date(task.due_date), 'dd MMM yy', { locale: tr }) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {task.matched_rule ? (
                        <Badge variant="outline" className="text-xs">{task.matched_rule}</Badge>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {task.accepted_at ? format(new Date(task.accepted_at), 'dd MMM HH:mm', { locale: tr }) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {task.sheets_synced ? (
                        <span className="text-xs text-green-600 font-medium">✓</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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