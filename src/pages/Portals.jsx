import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Globe, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const emptyForm = { key: '', name: '', description: '', icon: 'Globe', color: 'blue', is_active: true };

export default function Portals() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const qc = useQueryClient();

  const { data: portals = [], isLoading } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editingId
        ? base44.entities.Portal.update(editingId, data)
        : base44.entities.Portal.create(data),
    onSuccess: () => {
      toast.success(editingId ? 'Portal güncellendi' : 'Portal eklendi');
      qc.invalidateQueries({ queryKey: ['portals-all'] });
      qc.invalidateQueries({ queryKey: ['portals'] });
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (err) => toast.error('Hata: ' + err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.Portal.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portals-all'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Portal.delete(id),
    onSuccess: () => {
      toast.success('Portal silindi');
      qc.invalidateQueries({ queryKey: ['portals-all'] });
      qc.invalidateQueries({ queryKey: ['portals'] });
    },
  });

  const handleEdit = (portal) => {
    setForm({ key: portal.key, name: portal.name, description: portal.description || '', icon: portal.icon || 'Globe', color: portal.color || 'blue', is_active: portal.is_active });
    setEditingId(portal.id);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.key.trim() || !form.name.trim()) { toast.error('Key ve Ad gerekli'); return; }
    saveMutation.mutate(form);
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Portaller</h1>
          <p className="text-muted-foreground text-sm mt-1">Bağlı translation portallarını yönetin</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Yeni Portal
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 border-primary/30 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editingId ? 'Portal Düzenle' : 'Yeni Portal'}</CardTitle>
            <CardDescription className="text-xs">Portal ekledikten sonra ilgili backend fonksiyonunu oluşturmanız gerekir.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Key (tekil, değiştirilemez)</Label>
                <Input
                  value={form.key}
                  onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                  placeholder="örn: protemos"
                  disabled={!!editingId}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Görünen Ad</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="örn: Protemos" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Açıklama</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Kısa açıklama..." />
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1">
                {saveMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm); setEditingId(null); }}>İptal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-24 bg-secondary rounded-xl animate-pulse" />)}
        </div>
      ) : portals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Henüz portal yok.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {portals.map(portal => (
            <Card key={portal.id} className={`shadow-sm ${!portal.is_active ? 'opacity-60' : ''}`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                      <Globe className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{portal.name}</span>
                        <Badge variant="outline" className="text-xs font-mono">{portal.key}</Badge>
                        {portal.is_active ? (
                          <Badge className="bg-green-100 text-green-700 text-xs">Aktif</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Pasif</Badge>
                        )}
                      </div>
                      {portal.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{portal.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={portal.is_active}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: portal.id, is_active: v })}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(portal)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(portal.id)}
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