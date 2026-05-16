import { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Folder, ChevronRight, ArrowUp, RefreshCw, AlertCircle, Check, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// Visual Dropbox folder picker. Browses the shared Dropbox account starting
// at `rootPath` and never lets the user navigate above it. Calls `onSelect`
// with the absolute Dropbox path of the chosen folder (or rootPath when the
// user picks "this folder").
//
// Props:
//   rootPath   — absolute path that bounds navigation, e.g. "/El Turco Team Folder/Projects"
//   value      — current absolute path to highlight (optional)
//   onSelect   — (absolutePath) => void
export default function DropboxFolderPicker({ rootPath, value, onSelect }) {
  const normalizedRoot = (rootPath || '').replace(/\/+$/, '') || '/';
  const [currentPath, setCurrentPath] = useState(normalizedRoot);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (path) => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('listDropboxContents', { path });
      setEntries(res?.data?.entries || []);
    } catch (err) {
      // Error payloads from base44.functions land in err.response?.data.
      const msg = err?.response?.data?.error || err?.message || 'Failed to load Dropbox folder';
      setError(msg);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(currentPath);
  }, [currentPath, load]);

  const canGoUp = currentPath !== normalizedRoot && currentPath.startsWith(normalizedRoot + '/');
  const goUp = () => {
    if (!canGoUp) return;
    const parent = currentPath.replace(/\/[^/]+$/, '') || '/';
    // Don't allow climbing above the configured root.
    if (parent === normalizedRoot || parent.startsWith(normalizedRoot + '/')) {
      setCurrentPath(parent);
    } else {
      setCurrentPath(normalizedRoot);
    }
  };

  // Breadcrumb segments, scoped to the root (root shown as a single chip).
  const relativeFromRoot = currentPath === normalizedRoot
    ? ''
    : currentPath.slice(normalizedRoot.length).replace(/^\/+/, '');
  const segments = relativeFromRoot ? relativeFromRoot.split('/') : [];

  const isSelected = value && value.replace(/\/+$/, '') === currentPath.replace(/\/+$/, '');

  return (
    <div className="border border-line-1 rounded-md bg-surface-1 overflow-hidden">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-line-1 bg-surface-2 text-[12px] overflow-x-auto">
        <button
          onClick={() => setCurrentPath(normalizedRoot)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-ink-2 hover:bg-surface-1 transition-colors duration-tab font-mono whitespace-nowrap"
          title={normalizedRoot}
        >
          <Folder className="w-3 h-3" />
          {normalizedRoot.split('/').filter(Boolean).pop() || '/'}
        </button>
        {segments.map((seg, i) => {
          const target = normalizedRoot + '/' + segments.slice(0, i + 1).join('/');
          return (
            <span key={i} className="inline-flex items-center gap-1">
              <ChevronRight className="w-3 h-3 text-ink-4" />
              <button
                onClick={() => setCurrentPath(target)}
                className="px-2 py-1 rounded text-ink-2 hover:bg-surface-1 transition-colors duration-tab font-mono whitespace-nowrap"
              >
                {seg}
              </button>
            </span>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={() => load(currentPath)}
          disabled={loading}
          title="Refresh"
          className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-3 hover:bg-surface-1 transition-colors duration-tab disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={goUp}
          disabled={!canGoUp}
          title="Up one level"
          className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-3 hover:bg-surface-1 transition-colors duration-tab disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Listing */}
      <div className="max-h-72 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-7" />)}
          </div>
        ) : error ? (
          <div className="px-4 py-6 flex items-start gap-2 text-[12px] text-danger">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Couldn't load folder</p>
              <p className="text-ink-3 italic-editorial mt-0.5">{error}</p>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[12px] text-ink-3 italic-editorial">This folder is empty.</p>
          </div>
        ) : (
          <ul className="py-1">
            {entries.map((e) => {
              const isFolder = e.type === 'folder';
              return (
                <li key={e.path_lower}>
                  <button
                    onClick={() => isFolder && setCurrentPath(e.path_display)}
                    disabled={!isFolder}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left transition-colors duration-tab ${
                      isFolder ? 'text-ink-1 hover:bg-surface-2 cursor-pointer' : 'text-ink-4 cursor-default'
                    }`}
                  >
                    {isFolder ? (
                      <Folder className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
                    )}
                    <span className="truncate flex-1">{e.name}</span>
                    {isFolder && <ChevronRight className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer — select current folder */}
      <div className="border-t border-line-1 px-3 py-2 bg-surface-2 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-ink-3">Selected</p>
          <p className="text-[12px] font-mono text-ink-1 truncate" title={currentPath}>{currentPath}</p>
        </div>
        <button
          onClick={() => onSelect?.(currentPath)}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded text-[12px] font-medium transition-colors duration-tab ${
            isSelected
              ? 'bg-success-soft text-success border border-success/30'
              : 'bg-accent text-white hover:bg-[var(--accent-hover)]'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
          {isSelected ? 'Selected' : 'Use this folder'}
        </button>
      </div>
    </div>
  );
}