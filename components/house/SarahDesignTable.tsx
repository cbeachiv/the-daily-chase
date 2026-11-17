// Sarah's full-service interior-design fee for the Hugga expansion (lodge, 20-key
// hotel, four one-bedroom cabins). Table of the per-property fee + methodology.
// Pure presentational, reused verbatim by the planner and the brief. Sarah is not
// a Hugga member, so this is arm's-length household income toward the house.
import { SARAH_DESIGN, SARAH_DESIGN_TOTAL, SARAH_FEE_NET_FACTOR } from "@/lib/house";
import { fmtUSD } from "@/lib/finance";

export default function SarahDesignTable() {
  const net = Math.round(SARAH_DESIGN_TOTAL * SARAH_FEE_NET_FACTOR);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-2 pr-2">Property</th>
              <th className="py-2 text-right">Full-service fee</th>
            </tr>
          </thead>
          <tbody>
            {SARAH_DESIGN.map((s) => (
              <tr key={s.label} className="border-b border-line/60">
                <td className="py-2 pr-2">
                  {s.label}
                  {s.note ? <span className="text-muted"> ({s.note})</span> : null}
                </td>
                <td className="py-2 text-right tabular-nums">{fmtUSD(s.fee)}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="py-2 pr-2">Total design fee</td>
              <td className="py-2 text-right tabular-nums">{fmtUSD(SARAH_DESIGN_TOTAL)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 space-y-2 text-sm leading-relaxed">
        <p>
          This is a solo high-end, full-service fee: concept and space planning, full 3D renderings,
          FF&amp;E specification, ordering and procurement, contractor coordination, and install and
          styling. It lands near {fmtUSD(SARAH_DESIGN_TOTAL)} three different ways: about 1,100 hours
          at roughly $185/hour, about 30% of an estimated ~$650k furnishings budget, and standard
          per-key and per-building hospitality rates.
        </p>
        <p>
          Furnishings (FF&amp;E) are a separate budget bought at Sarah&apos;s trade cost, not part of
          her fee. Her trade discounts on that ~$650k of goods often offset a large share of the fee,
          so Hugga gets designer-quality outfitting for close to what the furniture alone would cost
          retail.
        </p>
        <p>
          Because Sarah is not a Hugga member, this is arm&apos;s-length household income, roughly{" "}
          {fmtUSD(net)} after self-employment and income tax. It is earned as the expansion is
          designed and built across 2027 and 2028, which overlaps the house purchase window, so it
          flows straight into the house fund at the moment we need it.
        </p>
      </div>
    </div>
  );
}
