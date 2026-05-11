import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableProperties, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function SyncStatusCard({ synced, pending, isSyncing, onSync }) {
  const allSynced = pending === 0 && synced > 0;

  return (
    <Card className="shadow-sm bg-gradient-to-br from-emerald-50/60 to-white border-emerald-100">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
              <TableProperties className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Google Sheets Sync</p>
              <p className="text-[11px] text-muted-foreground">Auto every 5 min · trigger on new accept</p>
            </div>
          </div>
          {allSynced ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1">
              <CheckCircle2 className="w-3 h-3" /> All synced
            </Badge>
          ) : pending > 0 ? (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              {pending} pending
            </Badge>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white/70 rounded-lg p-3 border border-emerald-100/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Synced</p>
            <p className="text-2xl font-bold text-emerald-600 tabular-nums">{synced}</p>
          </div>
          <div className="bg-white/70 rounded-lg p-3 border border-emerald-100/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pending</p>
            <p className={`text-2xl font-bold tabular-nums ${pending > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
              {pending}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={isSyncing || pending === 0}
          className="w-full gap-2"
        >
          {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <TableProperties className="w-3.5 h-3.5" />}
          {isSyncing ? 'Syncing...' : pending === 0 ? 'Nothing to sync' : `Sync ${pending} now`}
        </Button>
      </CardContent>
    </Card>
  );
}