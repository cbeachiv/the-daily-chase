// Mariemont house-plan math: mortgage amortization, carry costs, cash to close,
// savings stats/projection from finance snapshots, and the Hugga vesting
// economics table. Pure functions (no React, no Firestore) shared by the
// interactive /mariemont-house page and the printable /mariemont-house/brief.

import type { FinanceSnapshot, HousePlan } from "@/lib/types";
import { addMonths, DEFAULT_HUGGA } from "@/lib/finance";

export const HOUSE_PLAN_DOC_ID = "mariemont";

export const HOUSE_PLAN_DEFAULTS: Omit<HousePlan, "id" | "createdAt"> = {
  purchasePrice: 1_341_219, // off-market equivalent of the $455.92/sqft comp (5.5% selling costs removed)
  downPaymentPct: 0.25,
  ratePct: 6.0,
  termYears: 30,
  closingCostPct: 0.02,
  reserveMonths: 6,
  supportLow: 150_000,
  supportHigh: 350_000,
  windowStart: "2027-06",
  windowEnd: "2028-12",
  carryComfort: 7_000,
  propertyTaxPct: 0.022, // Hamilton County / Mariemont estimate
  insurancePct: 0.004,
  sarahDesignFee: 20_000, // working planning number, kept intentionally modest (market-rate full-service estimate is SARAH_DESIGN_TOTAL)
};

// ── Mortgage math ────────────────────────────────────────────────────────────

// Standard amortization: P&I = L·r / (1 − (1+r)^−n), r = monthly rate.
// Sanity anchor: $975k at 6% / 30yr ≈ $5,846/mo.
export function monthlyPI(principal: number, ratePct: number, termYears: number): number {
  const r = ratePct / 100 / 12;
  const n = Math.max(1, termYears * 12);
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export interface CarryBreakdown {
  pi: number;
  taxes: number;
  insurance: number;
  total: number;
}

export function monthlyCarry(plan: HousePlan): CarryBreakdown {
  const loan = plan.purchasePrice * (1 - plan.downPaymentPct);
  const pi = monthlyPI(loan, plan.ratePct, plan.termYears);
  const taxes = (plan.purchasePrice * plan.propertyTaxPct) / 12;
  const insurance = (plan.purchasePrice * plan.insurancePct) / 12;
  return { pi, taxes, insurance, total: pi + taxes + insurance };
}

export interface CashToClose {
  downPayment: number;
  closingCosts: number;
  reserves: number;
  total: number;
}

export function cashToClose(plan: HousePlan): CashToClose {
  const downPayment = plan.purchasePrice * plan.downPaymentPct;
  const closingCosts = plan.purchasePrice * plan.closingCostPct;
  const reserves = plan.reserveMonths * monthlyCarry(plan).total;
  return { downPayment, closingCosts, reserves, total: downPayment + closingCosts + reserves };
}

// ── Savings stats & projection (from finance snapshots) ──────────────────────

export interface SavingsStats {
  latestMonth: string | null; // newest snapshot month with a savings balance
  liquid: number; // savings + cashChecking at that snapshot
  netWorth: number; // bitcoin + ira + savings + hugga + cashChecking
  avgNetSaved: number; // mean monthly income − spend over the recent window
  savingsRateLatest: number | null; // (income − spend) / income, latest usable month
  avgSavingsRate: number | null; // same, averaged over the window
  monthsUsed: number; // how many months fed the averages
  usedFallback: boolean; // true = averages came from liquid deltas, not income/spend
}

const liquidOf = (s: FinanceSnapshot) => (s.savings ?? 0) + (s.cashChecking ?? 0);

export function netWorthOf(s: FinanceSnapshot): number {
  // Hugga is a fixed holding: months without their own value count DEFAULT_HUGGA,
  // matching how the Finance tab computes net worth.
  return (s.bitcoin ?? 0) + (s.ira ?? 0) + (s.savings ?? 0) + (s.hugga ?? DEFAULT_HUGGA) + (s.cashChecking ?? 0);
}

export function savingsStats(snapshots: FinanceSnapshot[], windowMonths = 6): SavingsStats {
  const sorted = [...snapshots].sort((a, b) => a.month.localeCompare(b.month));
  const withBalance = sorted.filter((s) => s.savings != null);
  const latest = withBalance[withBalance.length - 1];

  // Months with real income/spend feed the savings-rate averages.
  const usable = sorted.filter((s) => s.income != null && s.spend != null && s.income! > 0);
  const recent = usable.slice(-windowMonths);

  let avgNetSaved = 0;
  let avgSavingsRate: number | null = null;
  let usedFallback = false;
  let monthsUsed = recent.length;

  if (recent.length >= 2) {
    avgNetSaved = recent.reduce((sum, s) => sum + (s.income! - s.spend!), 0) / recent.length;
    avgSavingsRate = recent.reduce((sum, s) => sum + (s.income! - s.spend!) / s.income!, 0) / recent.length;
  } else if (withBalance.length >= 2) {
    // Fallback: month-over-month liquid deltas when income/spend history is thin.
    const tail = withBalance.slice(-(windowMonths + 1));
    const deltas: number[] = [];
    for (let i = 1; i < tail.length; i++) deltas.push(liquidOf(tail[i]) - liquidOf(tail[i - 1]));
    avgNetSaved = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    monthsUsed = deltas.length;
    usedFallback = true;
  }

  const latestUsable = usable[usable.length - 1];
  return {
    latestMonth: latest?.month ?? null,
    liquid: latest ? liquidOf(latest) : 0,
    netWorth: latest ? netWorthOf(latest) : 0,
    avgNetSaved,
    savingsRateLatest: latestUsable ? (latestUsable.income! - latestUsable.spend!) / latestUsable.income! : null,
    avgSavingsRate,
    monthsUsed,
    usedFallback,
  };
}

export interface TrajectoryPoint {
  month: string; // "YYYY-MM"
  balance: number;
  projected: boolean;
}

// Actual liquid history from snapshots, then a straight-line projection from the
// latest balance at `monthlyNetSaved` per month (no return assumptions — honest
// and defensible). Projection input is clamped at ≥ 0 so a bad month doesn't
// project savings shrinking forever; the UI flags that case.
export function projectTrajectory(
  snapshots: FinanceSnapshot[],
  monthlyNetSaved: number,
  throughMonth: string
): TrajectoryPoint[] {
  const actual = [...snapshots]
    .filter((s) => s.savings != null)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((s) => ({ month: s.month, balance: liquidOf(s), projected: false }));
  if (actual.length === 0) return [];

  const points = [...actual];
  const perMonth = Math.max(0, monthlyNetSaved);
  let { month, balance } = actual[actual.length - 1];
  while (month < throughMonth) {
    month = addMonths(month, 1);
    balance += perMonth;
    points.push({ month, balance, projected: true });
  }
  return points;
}

// Projected liquid balance at a month (nearest point at or before it).
export function projectedAt(traj: TrajectoryPoint[], month: string): number {
  let best = 0;
  for (const p of traj) {
    if (p.month <= month) best = p.balance;
    else break;
  }
  return best;
}

// ── The gap ──────────────────────────────────────────────────────────────────

export interface GapResult {
  need: number; // cash to close incl. reserves
  savings: number; // projected liquid savings at the target month
  sarahNet: number; // Sarah's design fee, net of tax (0 if excluded)
  own: number; // savings + sarahNet — resources the household brings itself
  atSavingsOnly: number; // need − savings (positive = short)
  atOwn: number; // need − own (savings + Sarah's fee)
  atLowSupport: number; // atOwn − supportLow
  atHighSupport: number; // atOwn − supportHigh
}

// projectedSavings and sarahNet are both "our own" money; Timmy support stacks on
// top. sarahNet defaults to 0 so callers that don't model Sarah are unaffected.
export function computeGap(plan: HousePlan, projectedSavings: number, sarahNet = 0): GapResult {
  const need = cashToClose(plan).total;
  const own = projectedSavings + sarahNet;
  return {
    need,
    savings: projectedSavings,
    sarahNet,
    own,
    atSavingsOnly: need - projectedSavings,
    atOwn: need - own,
    atLowSupport: need - own - plan.supportLow,
    atHighSupport: need - own - plan.supportHigh,
  };
}

// ── Debt-to-income sanity check ──────────────────────────────────────────────

export interface DtiCheck {
  monthlyGross: number;
  carry: number;
  frontEndPct: number; // carry / gross, as a fraction
  verdict: "comfortable" | "tight" | "over";
}

export function dtiCheck(plan: HousePlan, annualSalary = 150_000): DtiCheck {
  const monthlyGross = annualSalary / 12;
  const carry = monthlyCarry(plan).total;
  const frontEndPct = carry / monthlyGross;
  return {
    monthlyGross,
    carry,
    frontEndPct,
    verdict: frontEndPct < 0.28 ? "comfortable" : frontEndPct <= 0.36 ? "tight" : "over",
  };
}

// ── Hugga vesting economics ──────────────────────────────────────────────────
// Chase's 70% profits interest in Olio Investments LLC vests 17.5%/yr from
// 12/31/25 (the 51% second-location condition is treated as clarified — clean
// path to 70%). Revenue path and 22% EBITDA margin are Chase's assumptions.
// "Implied share" is an economic claim on EBITDA, not cash in pocket:
// distributions are at the Managers' discretion after reserves and reinvestment.

export const HUGGA_EBITDA_MARGIN = 0.22;

// Timmy's tax-distribution idea: instead of cash distributions, Hugga distributes
// for taxes as if every member were in a 50% bracket; each member pays their real
// rate and pockets the spread. Chase's marginal rate on new pass-through income:
// 22% federal bracket + 3.1% Ohio marginal (2025 return) ≈ 25.1%. QBI deduction
// and SE tax could move this a few points either way — CPA refines.
export const HUGGA_TAX_DIST_RATE = 0.5;
export const CHASE_MARGINAL_RATE = 0.251;

export interface HuggaYear {
  year: number;
  revenue: number;
  ebitda: number;
  vestedPct: number; // vested profits interest at year end, as a fraction
  impliedShare: number; // ebitda × vestedPct
  taxDistribution: number; // impliedShare × HUGGA_TAX_DIST_RATE
  taxKept: number; // taxDistribution − actual tax = impliedShare × (dist rate − marginal rate)
}

const huggaYear = (year: number, revenue: number, vestedPct: number): HuggaYear => {
  const ebitda = revenue * HUGGA_EBITDA_MARGIN;
  const impliedShare = ebitda * vestedPct;
  return {
    year,
    revenue,
    ebitda,
    vestedPct,
    impliedShare,
    taxDistribution: impliedShare * HUGGA_TAX_DIST_RATE,
    taxKept: impliedShare * (HUGGA_TAX_DIST_RATE - CHASE_MARGINAL_RATE),
  };
};

export const HUGGA_VESTING: HuggaYear[] = [
  huggaYear(2026, 500_000, 0.35),
  huggaYear(2027, 1_000_000, 0.525),
  huggaYear(2028, 2_000_000, 0.7),
  huggaYear(2029, 2_300_000, 0.7),
  huggaYear(2030, 3_750_000, 0.7),
];

// At stabilized 2030 EBITDA, what 1 point of profits interest is worth per year —
// the reason equity buyback is the last-resort tool.
export const HUGGA_PER_POINT =
  HUGGA_VESTING[HUGGA_VESTING.length - 1].ebitda / 100;

// ── Value created beyond the original operational scope ──────────────────────
// Chase's scope is running the cabins + opening property two in 2028. These are
// software builds that go beyond that. The Hugga-facing items are NOT a bill to
// Hugga (he'll be majority owner one day); they document value. The Cocoon item
// is value created outside Hugga and is the clean case for separate comp.

export interface ValueItem {
  label: string;
  amount: number; // comparable market value ($)
  forEntity: "Hugga" | "Cocoon";
  approx?: boolean; // render "~$100,000"
  source?: string; // where the market number comes from, e.g. "Brave Little Beast quote"
  actual?: string; // what it actually cost / took Chase
}

export const VALUE_CREATED: ValueItem[] = [
  { label: "Guests First iOS app (built + maintained)", amount: 100_000, forEntity: "Hugga", approx: true, actual: "~15 hrs in Claude Code" },
  {
    label: "Hugga website + rebrand",
    amount: 100_000,
    forEntity: "Hugga",
    source: "Brave Little Beast: $100k, 6 months",
    actual: "$4,000 (Jon Flannery) + ~45 hrs over 6 weeks",
  },
  {
    label: "Hugga guest journals",
    amount: 27_300,
    forEntity: "Hugga",
    source: "Brave Little Beast: 156 hrs",
    actual: "~6 hrs in Claude Code",
  },
  { label: "Cocoon Coach website", amount: 67_000, forEntity: "Cocoon", source: "Michelle's quote", actual: "~5 hrs in Claude Code" },
];

export const VALUE_CREATED_TOTAL = VALUE_CREATED.reduce((s, v) => s + v.amount, 0);

// ── Sarah's design fee on the Hugga expansion ────────────────────────────────
// Sarah is a professional interior designer (Sarah Beach Interiors) and is NOT a
// Hugga member, so designing the expansion is arm's-length household income. The
// expansion is a lodge, a 20-key hotel, and four one-bedroom cabins. This is her
// full-service fee (concept + 3D renderings + FF&E spec + procurement + contractor
// coordination + install/styling), estimated as a solo high-end designer.
// Furnishings (FF&E) are a separate budget bought at her trade cost, not fee.
// Triangulates near $210k: hourly (~1,100 hrs × ~$185/hr), ~30% of an estimated
// ~$650k FF&E budget, and per-key/per-building hospitality norms.

export interface SarahScopeItem {
  label: string;
  fee: number;
  note?: string;
}

export const SARAH_DESIGN: SarahScopeItem[] = [
  { label: "Lodge — great room, dining, lobby, common areas", fee: 70_000, note: "design-heavy public spaces" },
  { label: "20-key hotel — prototype rooms + rollout across 20 keys", fee: 80_000, note: "~$4k/key all-in" },
  { label: "Four one-bedroom cabins — full units, 1–2 designs replicated", fee: 60_000, note: "~$15k/cabin" },
];

export const SARAH_DESIGN_TOTAL = SARAH_DESIGN.reduce((s, v) => s + v.fee, 0); // 210_000

// Share of the gross fee that reaches the household after self-employment +
// income tax. ~30% haircut, before business expenses and QBI — CPA refines.
export const SARAH_FEE_NET_FACTOR = 0.7;

// What Sarah Beach Interiors has actually earned to date (for the Timmy brief).
export const SARAH_EARNED_TO_DATE = 8_900;

// ── Comparable value: on-market vs off-market price per square foot ──────────
// A recent on-market Mariemont comp sold at $455.92/sqft. That gross figure
// includes the ~5-6% a seller pays in commissions and other selling costs, so an
// off-market sale that nets the seller the same is lower per foot. The house is
// 3,113 sqft; the planning price per foot derives from the current plan price.

export const COMP_PPSF = 455.92;
export const HOUSE_SQFT = 3113;
export const SELLING_COST_PCT = 0.055; // midpoint of the 5-6% range

export interface PpsfRow {
  label: string;
  ppsf: number;
  value: number;
  note: string;
}

export function ppsfComparison(): PpsfRow[] {
  const offPpsf = COMP_PPSF * (1 - SELLING_COST_PCT);
  return [
    {
      label: "On-market comp (a stranger pays)",
      ppsf: COMP_PPSF,
      value: COMP_PPSF * HOUSE_SQFT,
      note: "gross price, includes ~5-6% selling costs",
    },
    {
      label: "Off-market, seller nets the same",
      ppsf: offPpsf,
      value: offPpsf * HOUSE_SQFT,
      note: `${SELLING_COST_PCT * 100}% selling costs removed — the planning number`,
    },
  ];
}

// ── Down-payment scenarios ───────────────────────────────────────────────────

export interface DownScenario {
  downPct: number; // fraction
  downPayment: number;
  loan: number;
  pi: number;
  carry: number;
  cashToClose: number;
}

export function downScenarios(plan: HousePlan, pcts = [0.1, 0.2, 0.25, 0.3, 0.4, 0.5]): DownScenario[] {
  return pcts.map((downPct) => {
    const scenario: HousePlan = { ...plan, downPaymentPct: downPct };
    const carry = monthlyCarry(scenario);
    const close = cashToClose(scenario);
    return {
      downPct,
      downPayment: close.downPayment,
      loan: plan.purchasePrice * (1 - downPct),
      pi: carry.pi,
      carry: carry.total,
      cashToClose: close.total,
    };
  });
}
