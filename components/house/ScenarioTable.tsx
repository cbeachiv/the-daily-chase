// Down-payment scenario grid at the current purchase price. Pure props-in
// presentational table — reused by the printable brief.
import type { HousePlan } from "@/lib/types";
import { downScenarios } from "@/lib/house";
import { fmtUSD } from "@/lib/finance";

export default function ScenarioTable({ plan }: { plan: HousePlan }) {
  const rows = downScenarios(plan);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            <th className="py-2 pr-2">Down</th>
            <th className="py-2 pr-2 text-right">Down payment</th>
            <th className="py-2 pr-2 text-right">Loan</th>
            <th className="py-2 pr-2 text-right">P&amp;I / mo</th>
            <th className="py-2 pr-2 text-right">All-in carry / mo</th>
            <th className="py-2 text-right">Cash to close</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const active = Math.abs(r.downPct - plan.downPaymentPct) < 0.001;
            return (
              <tr key={r.downPct} className={`border-b border-line/60 ${active ? "bg-bg font-semibold" : ""}`}>
                <td className="py-2 pr-2">{Math.round(r.downPct * 100)}%</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtUSD(r.downPayment)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtUSD(r.loan)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtUSD(r.pi)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtUSD(r.carry)}</td>
                <td className="py-2 text-right tabular-nums">{fmtUSD(r.cashToClose)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        Carry includes property tax and insurance. Cash to close includes closing costs and{" "}
        {plan.reserveMonths} months of reserves. Highlighted row = current assumption.
      </p>
    </div>
  );
}
