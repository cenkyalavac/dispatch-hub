import { useState } from 'react';
import { Sheet, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import FormField from '@/components/ui/FormField';

const fieldCls = 'w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] font-mono outline-none placeholder:text-ink-4';

// Per-portal Sheets config + a one-click "create header row" helper.
// portalKey is null while creating a new connector (header button hidden until first save).
export default function PortalSheetsFields({ portalKey, spreadsheetId, tabName, onChange }) {
  const [creating, setCreating] = useState(false);

  const sheetUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null;

  const createHeader = async () => {
    if (!portalKey) return;
    setCreating(true);
    try {
      const res = await base44.functions.invoke('sheetsSetupHeader', { portal_key: portalKey });
      if (res.data?.success) toast.success(res.data.message || 'Header row created');
      else toast.error(res.data?.error || 'Failed');
    } catch (err) { toast.error(err.message); }
    finally { setCreating(false); }
  };

  return (
    <section className="border-t border-line-1 pt-4 mt-1">
      <div className="flex items-center gap-2 mb-1">
        <Sheet className="w-3.5 h-3.5 text-ink-3" />
        <h3 className="text-[13px] font-semibold text-ink-1">Google Sheets log</h3>
        <span className="text-[11px] text-ink-3 italic-editorial">— leave blank to use the global default</span>
      </div>

      <div className="grid grid-cols-[1fr_140px] gap-3 mt-3">
        <FormField
          label="Spreadsheet ID"
          helper={sheetUrl ? (
            <a href={sheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-ink hover:underline">
              Open in Sheets <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ) : 'The long ID in the spreadsheet URL'}
        >
          <input
            className={fieldCls}
            value={spreadsheetId || ''}
            onChange={(e) => onChange('sheets_spreadsheet_id', e.target.value.trim())}
            placeholder="1AbCdEf…"
          />
        </FormField>
        <FormField label="Tab name" helper="Defaults to first sheet">
          <input
            className={fieldCls}
            value={tabName || ''}
            onChange={(e) => onChange('sheets_tab_name', e.target.value)}
            placeholder="Sheet1"
          />
        </FormField>
      </div>

      {portalKey && spreadsheetId && (
        <button
          type="button"
          onClick={createHeader}
          disabled={creating}
          className="mt-2 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line-1 text-[11px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
        >
          {creating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
          Create header row
        </button>
      )}
    </section>
  );
}