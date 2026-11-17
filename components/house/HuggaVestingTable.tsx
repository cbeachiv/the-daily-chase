// Static Hugga vesting/economics table (Chase's revenue assumptions × 22% EBITDA
// margin × vested profits interest), plus Timmy's tax-distribution strategy:
// Hugga distributes for taxes at a 50% rate, Chase pays his real ~25% marginal
// rate and keeps the spread. Pure presentational — reused verbatim by the
// printable brief, so keep it free of interactive chrome.
import {
  HUGGA_VESTING,
  HUGGA_EBITDA_MARGIN,
  HUGGA_PER_POINT,
  HUGGA_TAX_DIST_RATE,
  CHASE_MARGINAL_RATE,
} from "@/lib/house";
import { fmtUSD } from "@/lib/finance";

export default function HuggaVestingTable() {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-2 pr-2">Year</th>
              <th className="py-2 pr-2 text-right">Revenue</th>
              <th className="py-2 pr-2 text-right">EBITDA @ {Math.round(HUGGA_EBITDA_MARGIN * 100)}%</th>
              <th className="py-2 pr-2 text-right">Vested %</th>
              <th className="py-2 pr-2 text-right">Implied share</th>
              <th className="py-2 pr-2 text-right">Tax dist @ {Math.round(HUGGA_TAX_DIST_RATE * 100)}%</th>
              <th className="py-2 text-right">Kept after tax</th>
            </tr>
          </thead>
          <tbody>
            {HUGGA_VESTING.map((y) => (
              <tr key={y.year} className="border-b border-line/60">
                <td className="py-2 pr-2 font-semibold">{y.year}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtUSD(y.revenue)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtUSD(y.ebitda)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{(y.vestedPct * 100).toFixed(1)}%</td>
                <td className="py-2 pr-2 text-right font-semibold tabular-nums text-indigo">
                  {fmtUSD(y.impliedShare)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtUSD(y.taxDistribution)}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-teal">
                  {fmtUSD(y.taxKept)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Implied share is an economic claim on EBITDA at the vested percentage, not cash in pocket:
        distributions are at the Managers&apos; discretion after debt service, reserves, and
        reinvestment. Vesting is 17.5% per year from 12/31/25 to 70%. At stabilized 2030 EBITDA,
        each 1% of profits interest represents about {fmtUSD(HUGGA_PER_POINT)} per year, which is
        why selling equity back is the last-resort tool.
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Tax dist: Timmy&apos;s idea of distributing only for taxes, computed as if each member were
        in a {Math.round(HUGGA_TAX_DIST_RATE * 100)}% bracket. Kept after tax is that distribution
        minus actual tax at a ~{Math.round(CHASE_MARGINAL_RATE * 100)}% marginal rate (22% federal
        bracket + 3.1% Ohio, per the 2025 return). It uses EBITDA as a proxy for taxable income;
        depreciation on the expansion would likely shrink taxable income, and QBI or SE tax could
        shift the rate, so treat these as ceilings and have the CPA refine.
      </p>
    </div>
  );
}
