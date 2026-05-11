import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const empty = {
  key: '', name: '', vendor: '', description: '',
  icon: 'Globe', color: 'blue', is_active: true,
  auth_type: 'oauth2_client_credentials', docs_url: '',
};

const COLORS = ['blue', 'purple', 'emerald', 'amber', 'rose'];
const ICONS = ['Globe', 'Building2', 'Network', 'Plug', 'Boxes', 'Briefcase', 'Cloud'];
const AUTH_TYPES = [
  { value: 'oauth2_client_credentials', label: 'OAuth 2.0 — Client Credentials' },
  { value: 'jwt_bearer', label: 'JWT Bearer Token' },
  { value: 'api_key', label: 'API Key' },
  { value: 'none', label: 'No authentication' },
];

export default function ConnectorFormDialog({ open, onClose, onSave, initial, isPending }) {
  const [form, setForm] = useState(empty);
  const isEdit = !!initial?.id;

  useEffect(() => {
    if (open) setForm(initial ? { ...empty, ...initial } : empty);
  }, [open, initial]);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Connector' : 'New Connector'}</DialogTitle>
          <DialogDescription>
            Configure the portal metadata. Backend functions and secrets are wired separately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Key</Label>
              <Input value={form.key} disabled={isEdit}
                onChange={e => update('key', e.target.value.toLowerCase().replace(/\s/g, '_'))}
                placeholder="e.g. junction" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Display name</Label>
              <Input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Welocalize Junction" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Vendor</Label>
              <Input value={form.vendor || ''} onChange={e => update('vendor', e.target.value)} placeholder="Welocalize" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Docs URL</Label>
              <Input value={form.docs_url || ''} onChange={e => update('docs_url', e.target.value)} placeholder="https://..." />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input value={form.description || ''} onChange={e => update('description', e.target.value)} placeholder="What this connector does..." />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <Select value={form.color} onValueChange={v => update('color', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLORS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Icon</Label>
              <Select value={form.icon} onValueChange={v => update('icon', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ICONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Auth type</Label>
              <Select value={form.auth_type} onValueChange={v => update('auth_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTH_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={isPending || !form.key || !form.name}
          >
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}