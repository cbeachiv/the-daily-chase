// On-market vs off-market price-per-square-foot comparison, grounding the
// planning price. Pure presentational, reused by the planner and the brief.
import { ppsfComparison, SELLING_COST_PCT } from "@/lib/house";
import { fmtUSD } from "@/lib/finance";

export default function CompValueTable() {
  const rows = ppsfComparison();
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-2 pr-2">Basis</th>
              <th className="py-2 pr-2 text-right">$ / sqft</th>
              <th className="py-2 text-right">Implied value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className={`border-b border-line/60 ${i === rows.length - 1 ? "font-semibold" : ""}`}>
                <td className="py-2 pr-2">
                  {r.label}
                  <span className="block text-[11px] font-normal text-muted">{r.note}</span>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtUSD(r.ppsf, true)}</td>
                <td className="py-2 text-right tabular-nums">{fmtUSD(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        The $455.92/sqft comp is a gross on-market price. Stripping the ~{SELLING_COST_PCT * 100}% a
        seller pays in commissions and selling costs, the Bahlers net about the same from a private
        sale at the off-market figure, which is the planning number used throughout.
      </p>
    </div>
  );
}
