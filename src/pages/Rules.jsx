import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, GripVertical, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import RuleForm from '@/components/rules/RuleForm';

export default function Rules() {
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [portalFilter, setPortalFilter] = useState('all');
  const qc = useQueryClient();

  const { data: portals = [] } = useQuery({
    queryKey: ['portals'],
    queryFn: () => base44.entities.Portal.list(),
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['rules-all', portalFilter],
    queryFn: () =>
      portalFilter === 'all'
        ? base44.entities.Rule.list('priority', 100)
        : base44.entities.Rule.filter({ portal: portalFilter }, 'priority', 100),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Rule.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules-all'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Rule.delete(id),
    onSuccess: () => {
      toast.success('Kural silindi');
      qc.invalidateQueries({ queryKey: ['rules-all'] });
    },
  });

  const handleToggle = (rule) => {
    updateMutation.mutate({ id: rule.id, data: { is_active: !rule.is_active } });
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setShowForm(true);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditingRule(null);
    qc.invalidateQueries({ queryKey: ['rules-all'] });
  };

  const actionColor = { accept: 'bg-green-100 text-green-700', reject: 'bg-red-100 text-red-600' };
  const actionLabel = { accept: 'Kabul Et', reject: 'Reddet' };

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Kurallar</h1>
          <p className="text-muted-foreground text-sm mt-1">Task kabul/red kurallarını yönetin</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={portalFilter} onValueChange={setPortalFilter}>
            <SelectTrigger className="w-44">
              <Globe className="w-4 h-4 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Portaller</SelectItem>
              {portals.map(p => (
                <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => { setEditingRule(null); setShowForm(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Yeni Kural
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="mb-6">
          <RuleForm rule={editingRule} portals={portals} onClose={handleClose} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-secondary rounded-xl animate-pulse" />)}
        </div>
      ) : rules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="text-sm">Henüz kural yok. İlk kuralınızı oluşturun.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id} className={`shadow-sm transition-all ${!rule.is_active ? 'opacity-50' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{rule.name}</span>
                        <Badge className={actionColor[rule.action]}>{actionLabel[rule.action]}</Badge>
                        <Badge variant="outline" className="text-xs">{rule.portal || 'symfonie'}</Badge>
                        <span className="text-xs text-muted-foreground">Öncelik: {rule.priority}</span>
                      </div>
                      {rule.conditions && rule.conditions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {rule.conditions.map((c, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                              <span className="font-medium">{c.field}</span>
                              <span>{c.operator}</span>
                              <span className="font-medium">"{c.value}"</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch checked={rule.is_active} onCheckedChange={() => handleToggle(rule)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(rule)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(rule.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}