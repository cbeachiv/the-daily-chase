"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useCollection } from "@/lib/data";
import type { FinanceSnapshot, HousePlan } from "@/lib/types";
import { fmtUSD, addMonths } from "@/lib/finance";
import {
  HOUSE_PLAN_DEFAULTS,
  HOUSE_PLAN_DOC_ID,
  SARAH_FEE_NET_FACTOR,
  cashToClose,
  computeGap,
  dtiCheck,
  monthlyCarry,
  projectTrajectory,
  projectedAt,
  savingsStats,
} from "@/lib/house";
import AssumptionsEditor from "@/components/house/AssumptionsEditor";
import HuggaVestingTable from "@/components/house/HuggaVestingTable";
import ValueCreatedTable from "@/components/house/ValueCreatedTable";
import SarahDesignTable from "@/components/house/SarahDesignTable";
import CompValueTable from "@/components/house/CompValueTable";
import ScenarioTable from "@/components/house/ScenarioTable";
import HouseTrajectoryChart from "@/components/charts/HouseTrajectoryChart";

export default function HousePlanner() {
  const { data: snapshots } = useCollection<FinanceSnapshot>("financeSnapshots");
  const { data: plans, uid } = useCollection<HousePlan>("housePlan");

  const planDoc = plans.find((p) => p.id === HOUSE_PLAN_DOC_ID);
  const plan: HousePlan = useMemo(
    () => ({ id: HOUSE_PLAN_DOC_ID, createdAt: "", ...HOUSE_PLAN_DEFAULTS, ...(planDoc ?? {}) }),
    [planDoc]
  );

  const stats = useMemo(() => savingsStats(snapshots), [snapshots]);
  const carry = useMemo(() => monthlyCarry(plan), [plan]);
  const close = useMemo(() => cashToClose(plan), [plan]);
  const dti = useMemo(() => dtiCheck(plan), [plan]);
  const trajectory = useMemo(
    () => projectTrajectory(snapshots, stats.avgNetSaved, addMonths(plan.windowEnd, 6)),
    [snapshots, stats.avgNetSaved, plan.windowEnd]
  );
  const midWindow = useMemo(() => {
    const [ys, ms] = plan.windowStart.split("-").map(Number);
    const [ye, me] = plan.windowEnd.split("-").map(Number);
    const span = (ye - ys) * 12 + (me - ms);
    return addMonths(plan.windowStart, Math.round(span / 2));
  }, [plan.windowStart, plan.windowEnd]);
  const sarahNet = useMemo(() => plan.sarahDesignFee * SARAH_FEE_NET_FACTOR, [plan.sarahDesignFee]);
  const gap = useMemo(
    () => computeGap(plan, projectedAt(trajectory, midWindow), sarahNet),
    [plan, trajectory, midWindow, sarahNet]
  );

  const gapColor = (g: number) => (g <= 0 ? "text-teal" : "text-coral");
  const gapLabel = (g: number) => (g <= 0 ? `covered, ${fmtUSD(-g)} cushion` : `${fmtUSD(g)} short`);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">The plan</h2>
          <p className="text-sm text-muted">
            The plan for 6965 Crystal Springs Drive: what it costs, where we are, and how we get there.
          </p>
        </div>
        <Link href="/mariemont-house/brief" className="btn-ghost shrink-0">
          Timmy brief
        </Link>
      </div>

      {/* Where I am today (live from Finance) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Liquid savings" value={fmtUSD(stats.liquid)} accent="text-teal" />
        <Stat label="Net worth" value={fmtUSD(stats.netWorth)} accent="text-ink" />
        <Stat
          label={`Avg saved / mo (${stats.monthsUsed}mo)`}
          value={fmtUSD(stats.avgNetSaved)}
          accent="text-indigo"
        />
        <Stat
          label="Savings rate (avg)"
          value={stats.avgSavingsRate != null ? `${(stats.avgSavingsRate * 100).toFixed(1)}%` : "—"}
          accent="text-sky"
        />
      </div>
      {stats.usedFallback && (
        <p className="text-xs text-amber">
          Savings pace estimated from month-over-month balance changes (thin income/spend history).
        </p>
      )}

      {/* The house */}
      <section className="card p-4">
        <h2 className="section-title mb-2">The house</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mariemont-house.jpg"
          alt="6965 Crystal Springs Drive, from the Hamilton County Auditor"
          className="mb-3 w-full max-w-md rounded-lg border border-line"
        />
        <div className="space-y-2 text-sm leading-relaxed">
          <p>
            <strong>6965 Crystal Springs Drive.</strong> 4 bed, 3.5 bath, 3,113 sqft. Stan and Bobbie
            Bahler, owners since 1982. County-assessed at $668,350; a recent Mariemont comp at
            $455.92/sqft implies a market value around <strong>$1.42M</strong>.
          </p>
          <p>
            On July 2, 2026 Stan said: <em>&quot;We would like to sell it to anyone but in particular
            you and Sarah.&quot;</em> They want to stay in Mariemont; their constraint is finding
            their next house, not deciding to sell. Timing is the biggest unknown (roughly a 12 to
            24 month window, so 2027 or 2028).
          </p>
          <p>
            An off-market sale is the edge: at a $1.42M listed value, 5 to 6% of selling costs mean
            the Bahlers net about the same from a private sale near <strong>$1.34M</strong>, the
            planning price used in the model. The value we bring is trust, certainty, and
            flexibility on their timeline.
          </p>
        </div>
        <div className="mt-3">
          <CompValueTable />
        </div>
      </section>

      <AssumptionsEditor uid={uid} plan={plan} docExists={!!planDoc} />

      {/* Computed outputs */}
      <section className="card p-4">
        <h2 className="section-title mb-3">What it takes</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Cash to close
            </div>
            <Row label={`Down payment (${Math.round(plan.downPaymentPct * 100)}%)`} value={fmtUSD(close.downPayment)} />
            <Row label={`Closing costs (${(plan.closingCostPct * 100).toFixed(1)}%)`} value={fmtUSD(close.closingCosts)} />
            <Row label={`Reserves (${plan.reserveMonths} mo carry)`} value={fmtUSD(close.reserves)} />
            <Row label="Total" value={fmtUSD(close.total)} bold />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Monthly carry
            </div>
            <Row label="Principal & interest" value={fmtUSD(carry.pi)} />
            <Row label="Property tax" value={fmtUSD(carry.taxes)} />
            <Row label="Insurance" value={fmtUSD(carry.insurance)} />
            <Row label="Total" value={fmtUSD(carry.total)} bold />
            <p className={`mt-2 text-xs font-medium ${dti.verdict === "comfortable" ? "text-teal" : dti.verdict === "tight" ? "text-amber" : "text-coral"}`}>
              {(dti.frontEndPct * 100).toFixed(0)}% of gross on a $150k salary ({dti.verdict}
              {plan.carryComfort > 0 && carry.total > plan.carryComfort
                ? `, above the ${fmtUSD(plan.carryComfort)} comfort line`
                : ""}
              )
            </p>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              The gap ({midWindow})
            </div>
            <Row label="Cash needed" value={fmtUSD(gap.need)} />
            <Row label="Projected savings" value={fmtUSD(gap.savings)} />
            <Row label="Sarah design fee (net)" value={fmtUSD(gap.sarahNet)} accent="text-teal" />
            <Row label="On our own" value={gapLabel(gap.atOwn)} accent={gapColor(gap.atOwn)} bold />
            <Row
              label={`With ${fmtUSD(plan.supportLow)} support`}
              value={gapLabel(gap.atLowSupport)}
              accent={gapColor(gap.atLowSupport)}
            />
            <Row
              label={`With ${fmtUSD(plan.supportHigh)} support`}
              value={gapLabel(gap.atHighSupport)}
              accent={gapColor(gap.atHighSupport)}
            />
          </div>
        </div>
      </section>

      {/* Trajectory */}
      <section className="card p-4">
        <h2 className="section-title mb-3">Savings vs the target</h2>
        <HouseTrajectoryChart points={trajectory} targetCash={close.total} />
        <p className="mt-2 text-xs text-muted">
          Straight-line projection at {fmtUSD(stats.avgNetSaved)}/mo (recent average). No investment
          returns assumed. Target line is total cash to close including reserves.
        </p>
      </section>

      {/* Scenarios */}
      <section className="card p-4">
        <h2 className="section-title mb-3">Down payment scenarios at {fmtUSD(plan.purchasePrice)}</h2>
        <ScenarioTable plan={plan} />
      </section>

      {/* Hugga */}
      <section className="card p-4">
        <h2 className="section-title mb-3">Hugga economics and the timing mismatch</h2>
        <p className="mb-3 text-sm leading-relaxed">
          If we execute, the 70% profits interest becomes the thing that solves the long-term
          financial picture. The problem is not fairness; it is <strong>liquidity timing</strong>.
          The house may become real before Hugga distributes meaningful cash and before a lender
          will underwrite K-1 income.
        </p>
        <HuggaVestingTable />
      </section>

      {/* Value beyond the original scope */}
      <section className="card p-4">
        <h2 className="section-title mb-3">Value I&apos;m creating beyond the original scope</h2>
        <p className="mb-3 text-sm leading-relaxed">
          My original scope is operational: run the four cabins today, and help acquire and open
          property two in 2028. Alongside that, I have built and maintain software and digital
          infrastructure that goes well beyond running cabins. Here is the value of that work, in
          both dollars and the time it would have taken at market.
        </p>
        <ValueCreatedTable />
      </section>

      {/* Sarah's design work on the expansion */}
      <section className="card p-4">
        <h2 className="section-title mb-3">Sarah&apos;s design work on the expansion</h2>
        <p className="mb-3 text-sm leading-relaxed">
          The expansion needs an interior designer for the lodge, the 20-key hotel, and the four
          one-bedroom cabins. Sarah is a professional interior designer ({fmtUSD(8_900)} earned to
          date), and because she is not a Hugga member, hiring her is arm&apos;s-length household
          income, not an owner distribution. The table below is what this would cost at full-service
          market rates. The number the plan actually uses is the editable assumption above, kept
          intentionally modest so the house plan does not lean on her income and she never feels
          pressure to chase revenue.
        </p>
        <SarahDesignTable />
      </section>

      {/* The plan with Timmy */}
      <section className="card p-4">
        <h2 className="section-title mb-3">The plan with Timmy</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Separate Cocoon compensation.</strong> Real value created outside Hugga ops
            (Cocoon Coach website, SleevesAI, Cocoon systems). A defined retainer of $5k to $10k/mo
            is $60k to $120k/yr toward the house fund, capped at 3 to 5 hours/week so Hugga stays
            the main thing.
          </li>
          <li>
            <strong>Home-readiness bonus tied to Hugga milestones.</strong> Timmy already framed
            this as &quot;prepaying for your safety to allow for your focus.&quot; Example triggers:
            expansion financing closes, lodge construction starts, 2027 revenue hits $1M.
          </li>
          <li>
            <strong>Bridge against future distributions.</strong> If the Bahler house becomes real
            before Hugga distributes cash, a defined liquidity bridge (note, advance, or bonus)
            repayable from future Hugga/Cocoon economics. Needs CPA, attorney, and lender review.
          </li>
          <li>
            <strong>Distribution philosophy clarity.</strong> Agree on what happens once the
            expansion is open, debt service is covered, and reserves are funded.
          </li>
          <li>
            <strong>Equity buyback only as a last resort.</strong> Every 1% of profits interest is
            about $8,250/yr at stabilized EBITDA, before any multiple. Selling points today to solve
            a short-term cash gap gives up the asset that solves the problem permanently.
          </li>
        </ol>
        <p className="mt-3 text-sm font-medium">
          The ask is a framework and a range, not a check: &quot;Help me bridge the timing gap
          without damaging the long-term Hugga upside.&quot;
        </p>
      </section>

      {/* Next steps */}
      <section className="card p-4">
        <h2 className="section-title mb-3">Next steps</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          <li>Walk Timmy through this at the partner onsite; agree on the tools and the range.</li>
          <li>
            Talk to a lender: what history of K-1 distributions would they need to count Hugga
            income, and how would a bridge note affect underwriting?
          </li>
          <li>Clarify how expansion capital will be structured (loan, contribution, or preferred).</li>
          <li>Stay close to Stan and Bobbie; help them find their next Mariemont house if we can.</li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="card p-4">
      <div className={`text-xl font-extrabold tracking-tight ${accent}`}>{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold = false,
  accent = "",
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-2 py-0.5 text-sm ${bold ? "font-bold" : ""}`}>
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${accent}`}>{value}</span>
    </div>
  );
}
