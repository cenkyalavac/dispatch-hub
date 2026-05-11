import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, ArrowRight, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const STATUS_ICONS = {
  accepted: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  rejected: <XCircle className="w-4 h-4 text-red-400" />,
  error: <AlertCircle className="w-4 h-4 text-amber-500" />,
};

export default function ActivityFeed({ tasks = [] }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          Recent Activity
        </CardTitle>
        <Link to="/tasks">
          <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
            View all <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No activity yet.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {tasks.slice(0, 8).map(task => (
              <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors">
                {STATUS_ICONS[task.status] || STATUS_ICONS.accepted}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{task.task_name}</p>
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">{task.portal}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {task.project_name} · {task.source_language} → {task.target_language}
                    {task.matched_rule && <span className="ml-2">· rule: {task.matched_rule}</span>}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground flex-shrink-0">
                  {task.accepted_at ? formatDistanceToNow(new Date(task.accepted_at), { addSuffix: true }) : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}