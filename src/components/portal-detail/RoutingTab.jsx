import PortalSheetRoutes from '@/components/connectors/PortalSheetRoutes';

// Thin wrapper — full implementation lives in PortalSheetRoutes which already
// supports the per-portal route paradigm.
export default function RoutingTab({ portal }) {
  return (
    <div>
      <p className="text-[13px] text-ink-3 italic-editorial mb-4">
        Override the default Google Sheet for {portal.name} tasks that match specific conditions.
        First match wins. If nothing matches, the portal's default sheet (Settings tab) is used.
      </p>
      <PortalSheetRoutes portalKey={portal.key} />
    </div>
  );
}