"use client";

// Print-optimized home-readiness memo for Timmy. The screen view is a preview;
// Cmd+P (or the Print button) saves it as the PDF. Same data hooks and math as
// the interactive page (lib/house.ts), so the memo can never drift from the app.
// No Chart.js here: the trajectory renders as an inline SVG so print stays crisp.

import { useMemo } from "react";
import Link from "next/link";
import { useCollection } from "@/lib/data";
import type { FinanceSnapshot, HousePlan } from "@/lib/types";
import { fmtUSD, addMonths, monthLabel } from "@/lib/finance";
import { prettyDateLong, todayStr } from "@/lib/dates";
import {
  HOUSE_PLAN_DEFAULTS,
  HOUSE_PLAN_DOC_ID,
  SARAH_EARNED_TO_DATE,
  SARAH_FEE_NET_FACTOR,
  type TrajectoryPoint,
  cashToClose,
  computeGap,
  dtiCheck,
  monthlyCarry,
  projectTrajectory,
  projectedAt,
  savingsStats,
} from "@/lib/house";
import HuggaVestingTable from "@/components/house/HuggaVestingTable";
import ValueCreatedTable from "@/components/house/ValueCreatedTable";
import CompValueTable from "@/components/house/CompValueTable";
import ScenarioTable from "@/components/house/ScenarioTable";

export default function MariemontBriefPage() {
  const { data: snapshots } = useCollection<FinanceSnapshot>("financeSnapshots");
  const { data: plans } = useCollection<HousePlan>("housePlan");

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
    return addMonths(plan.windowStart, Math.round(((ye - ys) * 12 + (me - ms)) / 2));
  }, [plan.windowStart, plan.windowEnd]);
  const sarahNet = useMemo(() => plan.sarahDesignFee * SARAH_FEE_NET_FACTOR, [plan.sarahDesignFee]);
  const gap = useMemo(
    () => computeGap(plan, projectedAt(trajectory, midWindow), sarahNet),
    [plan, trajectory, midWindow, sarahNet]
  );

  // Milestone rows: latest actual, then every 6th projected month.
  const milestones = useMemo(() => {
    const projected = trajectory.filter((p) => p.projected);
    const lastActual = trajectory.filter((p) => !p.projected).slice(-1);
    return [...lastActual, ...projected.filter((_, i) => (i + 1) % 6 === 0)];
  }, [trajectory]);

  const shortOrCovered = (g: number) =>
    g <= 0 ? `covered with a ${fmtUSD(-g)} cushion` : `${fmtUSD(g)} short`;

  return (
    <div className="mx-auto max-w-3xl bg-white text-ink">
      <style>{`@page { size: letter; margin: 0.75in; } @media print { body { background: #fff; } }`}</style>

      {/* Screen-only hint bar */}
      <div className="mb-4 flex items-center justify-between rounded-lg border border-line bg-bg px-4 py-2 print:hidden">
        <span className="text-sm text-muted">
          This is the print view. Cmd+P and save as PDF.{" "}
          <Link href="/mariemont-house" className="font-medium text-indigo">
            Back to the planner
          </Link>
        </span>
        <button onClick={() => window.print()} className="btn-primary">
          Print
        </button>
      </div>

      <div className="space-y-6 text-[13px] leading-relaxed">
        {/* Header */}
        <header className="border-b-2 border-ink pb-3">
          <h1 className="text-2xl font-extrabold tracking-tight">Home Readiness Plan: Mariemont</h1>
          <p className="mt-1 text-sm text-muted">
            Prepared by Chase Beach for Timmy McCarthy · {prettyDateLong(todayStr())}
          </p>
        </header>

        {/* 1. Target situation */}
        <Section title="Target situation">
          <p>
            As our family grows, Sarah and I want to buy a home in Mariemont, or a lot to build on.
            We are not waiting for listings: we have mapped every parcel in the village to surface
            unbuilt land and likely off-market opportunities, and we are actively opening
            conversations. The map below shows what we are tracking.{" "}
            <strong>The full report on the Mariemont market and these opportunities is attached
            alongside this memo.</strong>
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mariemont-map.png"
            alt="Mariemont residential: unbuilt land and top opportunities"
            className="w-full rounded border border-line"
          />
          <p>
            Our dream home is the Bahlers&apos; at <strong>6965 Crystal Springs Drive</strong>. On
            July 2 Stan told me directly:{" "}
            <em>&quot;We would like to sell it to anyone but in particular you and Sarah.&quot;</em>{" "}
            They are staying in Mariemont; the only thing holding them up is finding their next
            house. Realistic window: <strong>{monthLabel(plan.windowStart)} to {monthLabel(plan.windowEnd)}</strong>.
          </p>
          <p>
            A recent Mariemont comp at $455.92/sqft implies a value around $1.42M on the open market
            (county-assessed $668,350). Because a private sale avoids 5 to 6% of selling costs, the
            Bahlers net about the same at <strong>{fmtUSD(plan.purchasePrice)}</strong>, which is
            the planning number used here. This memo lays out what the purchase takes, where I am,
            and the tools I would like us to agree on before the timing becomes urgent.
          </p>
          <div className="mt-1">
            <CompValueTable />
          </div>
        </Section>

        {/* 2. Where I am today */}
        <Section title="Where I am today">
          <table className="w-full text-[13px]">
            <tbody>
              <MemoRow label="Liquid savings" value={fmtUSD(stats.liquid)} note={stats.latestMonth ? `as of ${monthLabel(stats.latestMonth)}` : ""} />
              <MemoRow label="Net worth" value={fmtUSD(stats.netWorth)} note="savings, IRA, Bitcoin, Hugga" />
              <MemoRow label="Average saved per month" value={fmtUSD(stats.avgNetSaved)} note={`${stats.monthsUsed}-month average`} />
              <MemoRow
                label="Savings rate"
                value={stats.avgSavingsRate != null ? `${(stats.avgSavingsRate * 100).toFixed(1)}%` : "n/a"}
                note="of income, recent average"
              />
              <MemoRow label="Salary" value="$150,000" note="run through Cocoon today" />
              <MemoRow label="Debt" value="$0" note="no car loans, no student debt, no cards" />
            </tbody>
          </table>
        </Section>

        {/* 3. What the house costs */}
        <Section title="What the house costs">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="mb-1 font-bold">Cash to close</h3>
              <table className="w-full">
                <tbody>
                  <MemoRow label={`Down payment (${Math.round(plan.downPaymentPct * 100)}%)`} value={fmtUSD(close.downPayment)} />
                  <MemoRow label={`Closing costs (${(plan.closingCostPct * 100).toFixed(1)}%)`} value={fmtUSD(close.closingCosts)} />
                  <MemoRow label={`Reserves (${plan.reserveMonths} months of carry)`} value={fmtUSD(close.reserves)} />
                  <MemoRow label="Total" value={fmtUSD(close.total)} bold />
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="mb-1 font-bold">Monthly carry</h3>
              <table className="w-full">
                <tbody>
                  <MemoRow label={`Principal & interest (${plan.ratePct}%, ${plan.termYears}yr)`} value={fmtUSD(carry.pi)} />
                  <MemoRow label="Property tax" value={fmtUSD(carry.taxes)} />
                  <MemoRow label="Insurance" value={fmtUSD(carry.insurance)} />
                  <MemoRow label="Total" value={fmtUSD(carry.total)} bold />
                </tbody>
              </table>
              <p className="mt-1 text-xs text-muted">
                {(dti.frontEndPct * 100).toFixed(0)}% of gross salary today ({dti.verdict}). Lenders
                look for under 28% front-end, which is why qualifying income matters as much as cash.
              </p>
            </div>
          </div>
          <div className="mt-4 break-inside-avoid">
            <h3 className="mb-1 font-bold">Down payment scenarios at {fmtUSD(plan.purchasePrice)}</h3>
            <ScenarioTable plan={plan} />
          </div>
        </Section>

        {/* 4. The gap */}
        <Section title="The gap">
          <p>
            Saving {fmtUSD(stats.avgNetSaved)}/mo, projected liquid savings reach{" "}
            <strong>{fmtUSD(gap.savings)}</strong> by {monthLabel(midWindow)} (middle of the window)
            against <strong>{fmtUSD(gap.need)}</strong> needed. Adding Sarah&apos;s design fee on the
            expansion (about {fmtUSD(gap.sarahNet)} net, detailed below), our own resources reach{" "}
            <strong>{fmtUSD(gap.own)}</strong>. That is:
          </p>
          <ul className="list-disc pl-5">
            <li>Savings only: <strong>{shortOrCovered(gap.atSavingsOnly)}</strong></li>
            <li>On our own, with Sarah&apos;s design fee: <strong>{shortOrCovered(gap.atOwn)}</strong></li>
            <li>Plus {fmtUSD(plan.supportLow)} of support: <strong>{shortOrCovered(gap.atLowSupport)}</strong></li>
            <li>Plus {fmtUSD(plan.supportHigh)} of support: <strong>{shortOrCovered(gap.atHighSupport)}</strong></li>
          </ul>

          <TrajectorySvg points={trajectory} targetCash={close.total} />

          <table className="mt-2 w-full break-inside-avoid">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="py-1 pr-2">Month</th>
                <th className="py-1 text-right">Projected savings</th>
                <th className="py-1 text-right">vs cash needed ({fmtUSD(close.total)})</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.month} className="border-b border-line/60">
                  <td className="py-1 pr-2">
                    {monthLabel(m.month)}
                    {m.projected ? "" : " (actual)"}
                  </td>
                  <td className="py-1 text-right tabular-nums">{fmtUSD(m.balance)}</td>
                  <td className="py-1 text-right tabular-nums">
                    {m.balance >= close.total ? "covered" : fmtUSD(close.total - m.balance) + " to go"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-muted">
            Straight-line projection at the recent savings pace. No investment returns, raises, or
            distributions assumed.
          </p>
        </Section>

        {/* 5. Hugga economics & timing */}
        <Section title="Hugga economics and the timing mismatch" pageBreak>
          <p>
            If we execute the expansion, my profits interest becomes the thing that solves the
            long-term financial picture. The issue is not fairness; it is <strong>timing</strong>.
            The house is likely to become real before Hugga is distributing meaningful cash, and
            before a lender will count K-1 income without a distribution history.
          </p>
          <HuggaVestingTable />
          <p>
            Two implications. First, I do not want to sell or weaken the 70% to solve a short-term
            cash gap; if we execute, that equity is what makes the whole bet worth it for both of
            us. Second, because operating distributions flow first to vested profits interests
            (before Capital Units) once the Managers decide to distribute, Hugga can become a real
            cash-flow asset for me, but probably not until the expansion stabilizes.
          </p>
        </Section>

        {/* 5b. Value beyond the original scope */}
        <Section title="Value I'm creating beyond the original scope">
          <p>
            My original scope is operational: run the four cabins today, and help acquire and open
            property two in 2028. Alongside that, I have built and maintain software and digital
            infrastructure that goes well beyond running cabins. Here is the value of that work, in
            both dollars and the time it would have taken at market.
          </p>
          <ValueCreatedTable />
        </Section>

        {/* 5c. Sarah's design work */}
        <Section title="Sarah's design work">
          <p>
            Sarah&apos;s interior design business is real and growing: she has earned{" "}
            <strong>{fmtUSD(SARAH_EARNED_TO_DATE)}</strong> to date. What matters most to me is that
            she gets to pursue this dream at her own pace. I want to support her without her feeling
            pressure from me to chase revenue.
          </p>
          <p>
            For the Hugga expansion, she is still trying to figure out what her role would look
            like, and I am trying to give her the space to explore that on her own terms. For
            planning purposes I have penciled in roughly <strong>{fmtUSD(plan.sarahDesignFee)}</strong>{" "}
            of design work as a placeholder, not a commitment. Whatever she decides, hiring her is
            arm&apos;s-length work since she is not a Hugga member, and by design the house plan
            barely leans on her income (about {fmtUSD(gap.sarahNet)} net in the gap math above).
          </p>
        </Section>

        {/* 6. Proposed tools */}
        <Section title="Proposed tools, in priority order" pageBreak>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Separate Cocoon compensation.</strong> I am creating value outside Hugga ops
              (Cocoon Coach website, SleevesAI, Cocoon systems). A defined retainer of $5k to
              $10k/mo ($60k to $120k/yr), scoped quarterly and capped at 3 to 5 hours/week so Hugga
              stays the main thing.
            </li>
            <li>
              <strong>Home-readiness bonus tied to Hugga milestones.</strong> Prepaying for safety
              to protect focus, in your words. Example triggers: expansion financing closes, lodge
              construction starts, 2027 revenue hits $1M.
            </li>
            <li>
              <strong>Bridge against future distributions.</strong> If the Bahler house becomes real
              before distributions start, a defined liquidity bridge (note, advance, or bonus)
              repayable from future Hugga or Cocoon economics. Structured with our CPA, attorney,
              and lender so it does not hurt mortgage underwriting.
            </li>
            <li>
              <strong>Distribution philosophy.</strong> Agree now on what happens once the expansion
              is open, debt service is covered, and reserves are funded.
            </li>
            <li>
              <strong>Equity buyback, last resort only.</strong> Each 1% of profits interest is
              about $8,250/yr at stabilized EBITDA before any multiple. I would rather bridge than
              sell.
            </li>
          </ol>
        </Section>

        {/* 6b. What the money is for */}
        <Section title="What the money is for">
          <p>
            I want to be clear about the why. This is not about accumulating money for its own
            sake, and the house is just one thing. What I actually want is to be in a position to
            do good with what we earn:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Show up for community initiatives when they come up.</strong> Cindependent
              just took over the Mariemont Theatre and is raising $1M. I would love to be able to
              contribute $5,000 to things like that without hesitating.
            </li>
            <li>
              <strong>Back entrepreneurs I believe in</strong> with real support to pursue their
              goals, the way you have bet on me.
            </li>
            <li>
              <strong>Tithe</strong> and give consistently.
            </li>
          </ul>
          <p>The house fund is the first milestone, not the finish line.</p>
        </Section>

        {/* 7. Asks */}
        <Section title="The ask">
          <p>
            Not a check today. A framework: if the house becomes real in the next 12 to 24 months,
            can we agree the support range is roughly <strong>{fmtUSD(plan.supportLow)} to{" "}
            {fmtUSD(plan.supportHigh)}</strong>, delivered through the tools above in that order?
            With a range and a mechanism, Sarah and I can plan responsibly, and I can stay fully
            focused on building Hugga without this running in the background.
          </p>
          <ul className="list-disc pl-5">
            <li>Agree on the tools and the range at the onsite.</li>
            <li>I will get lender clarity on what counts toward qualifying income.</li>
            <li>Define how expansion capital is structured so we both know where the 70% stands.</li>
          </ul>
          <p className="font-medium">
            Help me bridge the timing gap without damaging the long-term Hugga upside.
          </p>
          <p>
            One last thing. I don&apos;t see a world where I&apos;m retired sitting on a beach.
            That&apos;s just not me. I&apos;m always going to be working on projects, and I&apos;m
            confident that a lot of them will be ones you and I build together for a long time to
            come. I&apos;m grateful to be building this with you.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  pageBreak = false,
}: {
  title: string;
  children: React.ReactNode;
  pageBreak?: boolean;
}) {
  return (
    <section className={`space-y-2 ${pageBreak ? "break-before-page" : ""}`}>
      <h2 className="border-b border-line pb-1 text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

function MemoRow({
  label,
  value,
  note = "",
  bold = false,
}: {
  label: string;
  value: string;
  note?: string;
  bold?: boolean;
}) {
  return (
    <tr className={`border-b border-line/60 ${bold ? "font-bold" : ""}`}>
      <td className="py-1 pr-2">{label}</td>
      <td className="py-1 text-right tabular-nums">{value}</td>
      {note !== undefined && <td className="py-1 pl-3 text-right text-xs text-muted">{note}</td>}
    </tr>
  );
}

// Crisp-in-print inline SVG: actual savings (solid), projection (dashed), and
// the cash-needed target (light rule). Vector output at any print DPI.
function TrajectorySvg({ points, targetCash }: { points: TrajectoryPoint[]; targetCash: number }) {
  if (points.length < 2) return null;

  const W = 640;
  const H = 200;
  const PAD = { l: 52, r: 8, t: 10, b: 22 };
  const max = Math.max(targetCash, ...points.map((p) => p.balance)) * 1.08;
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);

  const path = (pts: { i: number; v: number }[]) =>
    pts.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

  const lastActualIdx = points.reduce((idx, p, i) => (p.projected ? idx : i), 0);
  const actual = points.slice(0, lastActualIdx + 1).map((p, i) => ({ i, v: p.balance }));
  const projected = points.slice(lastActualIdx).map((p, j) => ({ i: lastActualIdx + j, v: p.balance }));

  // Year ticks on the x axis (January of each year present).
  const ticks = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.month.endsWith("-01"))
    .map(({ p, i }) => ({ i, label: p.month.slice(0, 4) }));

  const k = (v: number) => "$" + Math.round(v / 1000) + "k";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full break-inside-avoid" role="img" aria-label="Savings trajectory vs cash needed">
      {/* y gridlines at 0, half, max */}
      {[0, max / 2, max].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#eee4d8" strokeWidth="1" />
          <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#64748b">
            {k(v)}
          </text>
        </g>
      ))}
      {/* target line */}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(targetCash)} y2={y(targetCash)} stroke="#ff6b6b" strokeWidth="1.5" strokeDasharray="3 3" />
      <text x={W - PAD.r} y={y(targetCash) - 4} textAnchor="end" fontSize="10" fill="#ff6b6b">
        cash needed {k(targetCash)}
      </text>
      {/* actual + projected */}
      <path d={path(actual)} fill="none" stroke="#14b8a6" strokeWidth="2" />
      <path d={path(projected)} fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="6 4" />
      {/* x ticks */}
      {ticks.map((t) => (
        <text key={t.i} x={x(t.i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748b">
          {t.label}
        </text>
      ))}
    </svg>
  );
}
