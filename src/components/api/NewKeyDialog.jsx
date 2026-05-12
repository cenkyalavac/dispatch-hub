import { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';
import { toast } from 'sonner';

export default function NewKeyDialog({ token, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    toast.success('Token copied');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/40 backdrop-blur-sm p-4">
      <div className="bg-surface-1 border border-line-1 rounded-lg shadow-xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-[14px] font-semibold text-ink-1">Your new API key</h3>
            <p className="text-[12px] text-ink-3 italic-editorial mt-0.5">
              Copy it now — you won't see it again.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink-1 transition-colors duration-tab">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-surface-2 border border-line-1 rounded-md p-3 font-mono text-[12px] text-ink-1 break-all">
          {token}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={copy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy token'}
          </button>
        </div>
      </div>
    </div>
  );
}