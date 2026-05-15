import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Columns3, Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Info, X } from 'lucide-react';
import { toast } from 'sonner';
import { getSourceFieldsForPortal } from '@/lib/sheet-source-fields';
import SheetColumnHeaderInput from '@/components/connectors/SheetColumnHeaderInput';

const fieldCls = 'w-full h-8 px-2 rounded-md border border-line-1 bg-surface-1 text-[12px] outline-none placeholder:text-ink-4';

// Per-portal Google Sheets column mapping editor.
// Each row = one column in the destination sheet, identified by its header text.
// Order in the list = order of columns left-to-right.
//
// Persists as SheetColumnMapping entity rows (portal + header + source_field + order).
// When at least one active row exists, sheetsSyncPending uses these instead of the legacy fixed schema.

export default function PortalSheetColumns({ portal }) {
  const qc = useQueryClient();
  const queryKey = ['sheet-column-mappings', portal.key];
  const fields = getSourceFieldsForPortal(portal);

  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => base44.entities.SheetColumnMapping.filter({ portal: portal.key }, 'order', 200),
  });

  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey });

  const addRow = async () => {
    setBusy(true);
    try {
      const nextOrder = (rows[rows.length - 1]?.order ?? rows.length - 1) + 1;
      await base44.entities.SheetColumnMapping.create({
        portal: portal.key,
        header: '',
        source_field: fields[0]?.name || 'task_id',
        order: nextOrder,
        is_active: true,
      });
      refresh();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const updateRow = async (row, patch) => {
    try {
      await base44.entities.SheetColumnMapping.update(row.id, patch);
      refresh();
    } catch (e) { toast.error(e.message); }
  };

  const deleteRow = async (row) => {
    try {
      await base44.entities.SheetColumnMapping.delete(row.id);
      refresh();
    } catch (e) { toast.error(e.message); }
  };

  const move = async (row, direction) => {
    const idx = rows.findIndex((r) => r.id === row.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= rows.length) return;
    const other = rows[swapIdx];
    try {
      await Promise.all([
        base44.entities.SheetColumnMapping.update(row.id,   { order: other.order }),
        base44.entities.SheetColumnMapping.update(other.id, { order: row.order }),
      ]);
      refresh();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <section className="border-t border-line-1 pt-4 mt-4">
      <div className="flex items-center gap-2 mb-1">
        <Columns3 className="w-3.5 h-3.5 text-ink-3" />
        <h3 className="text-[13px] font-semibold text-ink-1">Sheet column mapping</h3>
        <span className="text-[11px] text-ink-3 italic-editorial">— pick any field for any column</span>
      </div>

      <p className="text-[11px] text-ink-3 italic-editorial mb-3 inline-flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>
          Each row below is one column in your sheet (left-to-right). The <b>header</b> is the text written into row 1; the
          <b> source field</b> is what gets pulled from each task. Click <b>+ field</b> to sum two numeric fields into one
          column (e.g. combine fuzzy + repetition bands). Leave empty to keep the legacy fixed schema.
        </span>
      </p>

      {isLoading ? (
        <div className="skel h-10 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic-editorial mb-2">
          No custom columns defined — using the built-in 11-column schema.
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[24px_1fr_1fr_72px] gap-2 px-1 text-[10px] uppercase tracking-wide text-ink-3">
            <span />
            <span>Sheet header</span>
            <span>Source field</span>
            <span className="text-right">Actions</span>
          </div>
          {rows.map((row, idx) => (
            <div key={row.id} className="grid grid-cols-[24px_1fr_1fr_72px] gap-2 items-start">
              <div className="flex flex-col items-center text-ink-4 pt-1">
                <button
                  type="button"
                  onClick={() => move(row, -1)}
                  disabled={idx === 0}
                  className="hover:text-ink-1 disabled:opacity-30"
                  title="Move up"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(row, 1)}
                  disabled={idx === rows.length - 1}
                  className="hover:text-ink-1 disabled:opacity-30"
                  title="Move down"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
              <SheetColumnHeaderInput
                value={row.header || ''}
                onCommit={(v) => updateRow(row, { header: v })}
              />
              {/* Source field stack — main field + optional second field summed into one column */}
              <div className="space-y-1">
                <select
                  className={fieldCls}
                  value={row.source_field}
                  onChange={(e) => updateRow(row, { source_field: e.target.value })}
                >
                  {fields.map((f) => (
                    <option key={f.name} value={f.name}>{f.label} ({f.name})</option>
                  ))}
                  {!fields.some((f) => f.name === row.source_field) && (
                    <option value={row.source_field}>{row.source_field} (missing)</option>
                  )}
                </select>
                {row.source_field_2 != null && row.source_field_2 !== '' ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-ink-4 px-1">+</span>
                    <select
                      className={fieldCls}
                      value={row.source_field_2}
                      onChange={(e) => updateRow(row, { source_field_2: e.target.value })}
                    >
                      {fields.map((f) => (
                        <option key={f.name} value={f.name}>{f.label} ({f.name})</option>
                      ))}
                      {!fields.some((f) => f.name === row.source_field_2) && (
                        <option value={row.source_field_2}>{row.source_field_2} (missing)</option>
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() => updateRow(row, { source_field_2: '' })}
                      className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-3 hover:bg-danger-soft hover:text-danger transition-colors duration-tab flex-shrink-0"
                      title="Remove second field"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateRow(row, { source_field_2: row.source_field })}
                    className="inline-flex items-center gap-1 h-6 px-1.5 rounded text-[11px] text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
                    title="Sum a second numeric field into this column"
                  >
                    <Plus className="w-2.5 h-2.5" /> field (sum)
                  </button>
                )}
              </div>
              <div className="flex items-center justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => deleteRow(row)}
                  className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-3 hover:bg-danger-soft hover:text-danger transition-colors duration-tab"
                  title="Remove column"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        disabled={busy}
        className="mt-2 inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-dashed border-line-2 text-[12px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
      >
        <Plus className="w-3 h-3" /> Add column
      </button>
    </section>
  );
}