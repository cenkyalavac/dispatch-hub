import StatusPill from './StatusPill';
import RelativeTime from './RelativeTime';
import FileLinks from './FileLinks';
import { vendorLabel } from '@/lib/worldserver';
import { fmtNumber, EM } from '@/lib/format';

export default function WsProjectRow({ project, onOpen }) {
  return (
    <tr
      onClick={() => onOpen(project)}
      className="border-b border-line-1 last:border-0 hover:bg-surface-2 transition-colors duration-tab cursor-pointer"
    >
      <td className="px-3 py-2.5 align-middle">
        <div className="text-[13px] font-medium text-ink-1 leading-tight">{project.pgName || EM}</div>
        <div className="text-[11px] font-mono text-ink-3 mt-0.5">{project.pgId}</div>
      </td>
      <td className="px-3 py-2.5 align-middle text-[12px] text-ink-2 whitespace-nowrap">{vendorLabel(project.vendor)}</td>
      <td className="px-3 py-2.5 align-middle text-[12px] text-ink-2">{project.locale || EM}</td>
      <td className="px-3 py-2.5 align-middle text-right text-[12px] font-mono text-ink-1 tabular-nums">
        {fmtNumber(project.totalWords || 0)}
      </td>
      <td className="px-3 py-2.5 align-middle"><StatusPill status={project.status} /></td>
      <td className="px-3 py-2.5 align-middle text-[12px] text-ink-3 whitespace-nowrap">
        <RelativeTime value={project.creationDate} />
      </td>
      <td className="px-3 py-2.5 align-middle text-[12px] text-ink-3 whitespace-nowrap">
        <RelativeTime value={project.dueDate} />
      </td>
      <td className="px-3 py-2.5 align-middle text-[12px] text-ink-3 whitespace-nowrap">
        <RelativeTime value={project.deliveredAt} />
      </td>
      <td className="px-3 py-2.5 align-middle">
        <FileLinks sourceUrl={project.sourceDropboxUrl} targetUrl={project.translatedDropboxUrl} />
      </td>
    </tr>
  );
}