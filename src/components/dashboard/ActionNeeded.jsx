import { Link } from 'react-router-dom';
import { ArrowRight, Inbox } from 'lucide-react';
import { EM } from '@/lib/format';

// Action Needed: per-portal pending preview. Symfonie/Junction live on the
// shared `/pending/:portal` route; GlobalLink has its own entity-backed page.
// We show top 5 by created_date desc and link out to the dedicated page.
function portalPendingPath(portalKey) {
  if (portalKey === 'globallink') return '/globallink/pending';
  return `/pending/${portalKey}`;
}

function PortalBlock({ portal, items, total }) {
  return (
    <section className="bg-surface-1 border border-line-1 rounded-md">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-line-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-ink-1 truncate">{portal.name}</span>
          <span className="text-[11px] text-ink-3 tabular-nums">{total} pending</span>
        </div>
        <Link
          to={portalPendingPath(portal.key)}
          className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink-1 transition-colors duration-tab"
        >
          See all <ArrowRight className="w-3 h-3" />
        </Link>
      </header>
      {items.length === 0 ? (
        <div className="px-4 py-5 text-center">
          <Inbox className="w-4 h-4 mx-auto text-ink-4 mb-1.5" />
          <p className="text-[11px] text-ink-3 italic-editorial">Nothing waiting.</p>
        </div>
      ) : (
        <div className="divide-y divide-line-1">
          {items.slice(0, 5).map((it) => (
            <Link
              key={it.id}
              to={portalPendingPath(portal.key)}
              className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2 transition-colors duration-tab"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-ink-1 truncate">
                  {it.task_name || it.submission_name || it.name || EM}
                </p>
                <p className="text-[11px] text-ink-3 truncate font-mono">
                  {it.source_language || EM} → {it.target_language || EM}
                  {it.project_name && <span className="font-sans"> · {it.project_name}</span>}
                </p>
              </div>
              <span className="text-[11px] text-ink-3 tabular-nums flex-shrink-0">
                {(it.word_count || 0).toLocaleString()} w
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ActionNeeded({ portalBuckets }) {
  const visible = portalBuckets.filter(b => b.total > 0 || b.portal.is_active);
  if (visible.length === 0) return null;

  return (
    <section className="mb-7">
      <h2 className="text-[14px] font-semibold text-ink-1 mb-3">Action needed</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {visible.map((b) => (
          <PortalBlock key={b.portal.key} portal={b.portal} items={b.items} total={b.total} />
        ))}
      </div>
    </section>
  );
}