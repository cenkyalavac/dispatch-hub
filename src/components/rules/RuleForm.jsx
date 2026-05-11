import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const FIELDS = [
  { value: 'project_name', label: 'Project Name' },
  { value: 'client_name', label: 'Client Name' },
  { value: 'source_language', label: 'Source Language' },
  { value: 'target_language', label: 'Target Language' },
  { value: 'word_count', label: 'Word Count' },
  { value: 'price', label: 'Price' },
];

const TEXT_OPS = [
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'equals', label: 'Equals' },
  { value: 'starts_with', label: 'Starts with' },
];

const NUM_OPS = [
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'greater_equal', label: '>=' },
  { value: 'less_equal', label: '<=' },
  { value: 'equals', label: '=' },
];

const numericFields = ['word_count', 'price', 'quantity'];

export default function RuleForm({ rule, portals = [], onClose }) {
  const [name, setName] = useState(rule?.name || '');
  const [portal, setPortal] = useState(rule?.portal || (portals[0]?.key || 'symfonie'));
  const [action, setAction] = useState(rule?.action || 'accept');
  const [priority, setPriority] = useState(rule?.priority || 1);
  const [conditions, setConditions] = useState(rule?.conditions || []);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (rule?.id) return base44.entities.Rule.update(rule.id, data);
      return base44.entities.Rule.create(data);
    },
    onSuccess: () => {
      toast.success(rule?.id ? 'Rule updated' : 'Rule created');
      onClose();
    },
    onError: (err) => toast.error('Error: ' + err.message),
  });

  const addCondition = () => {
    setConditions([...conditions, { field: 'project_name', operator: 'contains', value: '' }]);
  };

  const updateCondition = (idx, key, val) => {
    const updated = conditions.map((c, i) => {
      if (i !== idx) return c;
      const newC = { ...c, [key]: val };
      if (key === 'field') {
        newC.operator = numericFields.includes(val) ? 'greater_than' : 'contains';
      }
      return newC;
    });
    setConditions(updated);
  };

  const removeCondition = (idx) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error('Rule name is required'); return; }
    saveMutation.mutate({ name, portal, action, priority: Number(priority), conditions, is_active: true });
  };

  return (
    <Card className="border-primary/30 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{rule?.id ? 'Edit Rule' : 'New Rule'}</CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Rule Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Accept Amazon projects" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Priority</Label>
            <Input type="number" value={priority} onChange={e => setPriority(e.target.value)} min={1} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Portal</Label>
            <Select value={portal} onValueChange={setPortal}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {portals.length > 0
                  ? portals.map(p => <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>)
                  : <SelectItem value="symfonie">Moravia Symfonie</SelectItem>
                }
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accept">✓ Accept</SelectItem>
                <SelectItem value="reject">✗ Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Conditions (AND logic — all must match)</Label>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addCondition}>
              <Plus className="w-3 h-3" /> Add Condition
            </Button>
          </div>

          {conditions.length === 0 && (
            <p className="text-xs text-muted-foreground italic">If no conditions, the rule applies to all tasks.</p>
          )}

          {conditions.map((cond, idx) => {
            const isNum = numericFields.includes(cond.field);
            const ops = isNum ? NUM_OPS : TEXT_OPS;
            return (
              <div key={idx} className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
                <Select value={cond.field} onValueChange={v => updateCondition(idx, 'field', v)}>
                  <SelectTrigger className="h-8 text-xs w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={cond.operator} onValueChange={v => updateCondition(idx, 'operator', v)}>
                  <SelectTrigger className="h-8 text-xs w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ops.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Input
                  className="h-8 text-xs flex-1"
                  value={cond.value}
                  onChange={e => updateCondition(idx, 'value', e.target.value)}
                  placeholder={isNum ? '1000' : 'value...'}
                />

                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCondition(idx)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1">
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}