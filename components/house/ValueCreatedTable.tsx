// Value Chase is creating beyond his original operational scope (run the cabins,
// open property two in 2028). Table of comparable market value AND the time/cost
// it actually took, plus the framing prose. Pure presentational, reused verbatim
// by the planner and the brief. Positioning matters: the Hugga-facing builds are
// documented value, NOT an invoice to Hugga; only the Cocoon work is a candidate
// for separate near-term comp.
import { VALUE_CREATED, VALUE_CREATED_TOTAL } from "@/lib/house";
import { fmtUSD } from "@/lib/finance";

export default function ValueCreatedTable() {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-2 pr-2">What I delivered</th>
              <th className="py-2 pr-2 text-right">Market value</th>
              <th className="py-2 pr-2">What it took me</th>
              <th className="py-2 text-right">For</th>
            </tr>
          </thead>
          <tbody>
            {VALUE_CREATED.map((v) => (
              <tr key={v.label} className="border-b border-line/60 align-top">
                <td className="py-2 pr-2">
                  {v.label}
                  {v.source ? <div className="text-xs text-muted">{v.source}</div> : null}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {v.approx ? "~" : ""}
                  {fmtUSD(v.amount)}
                </td>
                <td className="py-2 pr-2 text-muted">{v.actual ?? ""}</td>
                <td className="py-2 text-right">
                  <span
                    className={`text-xs font-semibold ${
                      v.forEntity === "Cocoon" ? "text-indigo" : "text-teal"
                    }`}
                  >
                    {v.forEntity}
                  </span>
                </td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="py-2 pr-2">Total market value</td>
              <td className="py-2 pr-2 text-right tabular-nums">~{fmtUSD(VALUE_CREATED_TOTAL)}</td>
              <td className="py-2" />
              <td className="py-2" />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Hour figures are active build time measured from my Claude Code sessions, so they reflect
        real hands-on hours.
      </p>
      <div className="mt-3 space-y-2 text-sm leading-relaxed">
        <p>
          The unlock is AI. Working with Claude, I can deliver in hours what firms quote in months,
          and that speed compounds: it means I can keep creating this kind of value on top of my
          operational scope, not instead of it.
        </p>
        <p>
          These are Hugga assets, and I am not asking Hugga to pay me for them. As a future majority
          owner, building the best possible product is in my own interest. I am putting them on the
          record because the value is real, in both dollars and time. The guest journals Brave Little
          Beast quoted at $27,300 and 156 hours, I did in under 8 hours. The website and rebrand they
          quoted at $100,000 and six months, I delivered for $4,000 of design work from Jon Flannery
          and about 45 hours of my own time over six weeks.
        </p>
        <p>
          The Cocoon Coach website is different. That is value I created for Cocoon, outside Hugga
          entirely, and Michelle already has a $67,000 quote for comparable work. This is the
          cleanest case for the separate Cocoon compensation we have discussed.
        </p>
        <p>
          I am also open to picking back up two things we have talked about, both outside Hugga and
          both scoped and compensated separately: building SleevesAI, your personal finance
          dashboard, and running weekly revenue accountability meetings with Michelle and Mackee to
          help close coaching business for Cocoon.
        </p>
        <p className="text-muted">
          I am not expecting to be paid this money. I mostly want the value on the table, in dollars
          and in time, as we think through how what I am creating shows up now, not just down the road.
        </p>
      </div>
    </div>
  );
}
