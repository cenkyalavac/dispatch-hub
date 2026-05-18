// Reusable field/meaning table for the API docs. Centralises the styling so
// every "here's what this object's fields mean" table looks identical and
// reads identically. `rows` is an array of { field, type?, meaning }.
export default function FieldTable({ rows, fieldHeader = 'Field', meaningHeader = 'Meaning', showType = false }) {
  return (
    <div className="border border-line-1 rounded-md overflow-hidden">
      <table className="w-full text-[12.5px]">
        <thead className="bg-surface-2 text-ink-3">
          <tr>
            <th className="text-left px-3 py-2 font-medium w-[200px]">{fieldHeader}</th>
            {showType && <th className="text-left px-3 py-2 font-medium w-[120px]">Type</th>}
            <th className="text-left px-3 py-2 font-medium">{meaningHeader}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-1">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="px-3 py-2 font-mono text-ink-1 whitespace-nowrap">{r.field}</td>
              {showType && (
                <td className="px-3 py-2 font-mono text-[11.5px] text-ink-3">{r.type || ''}</td>
              )}
              <td className="px-3 py-2 text-ink-2 leading-relaxed">{r.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}