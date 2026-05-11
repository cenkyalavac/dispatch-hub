import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock, Play, RefreshCw, TrendingUp, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

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

  const { data: tasks = [], refetch } = useQuery({
    queryKey: ['accepted-tasks'],
    queryFn: () => base44.entities.AcceptedTask.list('-accepted_at', 20),
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['rules'],
    queryFn: () => base44.entities.Rule.filter({ is_active: true }),
  });

  const accepted = tasks.filter(t => t.status === 'accepted').length;
  const rejected = tasks.filter(t => t.status === 'rejected').length;

  const handleRun = async () => {
    setIsRunning(true);
    try {
      const res = await base44.functions.invoke('symfonieProcessTasks', {});
      const result = res.data;
      setLastResult(result);
      if (result.success) {
        toast.success(`İşlem tamamlandı: ${result.summary.accepted} kabul, ${result.summary.rejected} red`);
        refetch();
      } else {
        toast.error(result.error || 'İşlem başarısız');
      }
    } catch (err) {
      toast.error('Hata: ' + err.message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Symfonie task kabul sistemi durumu</p>
        </div>
        <Button
          onClick={handleRun}
          disabled={isRunning}
          className="gap-2 bg-primary hover:bg-primary/90"
        >
          {isRunning ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {isRunning ? 'İşleniyor...' : 'Manuel Çalıştır'}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Toplam İşlenen"
          value={tasks.length}
          icon={TrendingUp}
          color="bg-accent text-accent-foreground"
          sub="Bu oturumda"
        />
        <StatCard
          title="Kabul Edilen"
          value={accepted}
          icon={CheckCircle2}
          color="bg-green-100 text-green-600"
        />
        <StatCard
          title="Reddedilen"
          value={rejected}
          icon={XCircle}
          color="bg-red-100 text-red-500"
        />
        <StatCard
          title="Aktif Kural"
          value={rules.length}
          icon={Clock}
          color="bg-blue-100 text-blue-600"
        />
      </div>

      {lastResult && (
        <Card className="mb-6 border-primary/20 bg-accent/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Son Çalışma Sonucu</span>
            </div>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 font-medium">✓ {lastResult.summary?.accepted || 0} Kabul</span>
              <span className="text-red-500 font-medium">✗ {lastResult.summary?.rejected || 0} Red</span>
              <span className="text-muted-foreground">⊘ {lastResult.summary?.skipped || 0} Atlandı</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Son İşlenen Tasklar</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Henüz işlenen task yok. "Manuel Çalıştır" butonuna basın.</p>
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
                      <p className="text-sm font-medium">{task.task_name}</p>
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
                      {task.accepted_at ? format(new Date(task.accepted_at), 'dd MMM HH:mm', { locale: tr }) : ''}
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