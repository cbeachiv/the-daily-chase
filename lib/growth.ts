// WHO Child Growth Standards (girls) percentile math for Annie's growth tracking.
//
// Each standard is an LMS table: rows of [ageMonths, L, M, S]. A measurement's
// z-score comes from the Box-Cox transform z = ((value/M)^L - 1) / (L*S), and the
// percentile is the standard-normal CDF of z. The inverse (value at a given
// percentile) draws the reference bands on the chart.
//
// Sources (girls, 0–24 months):
//   weight-for-age & length-for-age LMS — WHO Child Growth Standards
//   head-circumference-for-age — L=1; M is the WHO median, S derived from the
//   published symmetric percentiles ((P97.7 − P2.3) / (4·M)).
// Annie is ~12 months; 0–24 covers her with a year of headroom (values clamp
// at the table ends beyond that).

import { ANNIE_BORN } from "@/lib/dates";

export type GrowthKind = "weight" | "length" | "head";

// [ageMonths, L, M, S]
type LMSRow = [number, number, number, number];

const WEIGHT: LMSRow[] = [
  [0, 0.3809, 3.2322, 0.14171],
  [1, 0.1714, 4.1873, 0.13724],
  [2, 0.0962, 5.1282, 0.13],
  [3, 0.0402, 5.8458, 0.12619],
  [4, -0.005, 6.4237, 0.12402],
  [5, -0.043, 6.8985, 0.12274],
  [6, -0.0756, 7.297, 0.12204],
  [7, -0.1039, 7.6422, 0.12178],
  [8, -0.1288, 7.9487, 0.12181],
  [9, -0.1507, 8.2254, 0.12199],
  [10, -0.17, 8.48, 0.12223],
  [11, -0.1872, 8.7192, 0.12247],
  [12, -0.2024, 8.9481, 0.12268],
  [13, -0.2158, 9.1699, 0.12283],
  [14, -0.2278, 9.387, 0.12294],
  [15, -0.2384, 9.6008, 0.12299],
  [16, -0.2478, 9.8124, 0.12303],
  [17, -0.2562, 10.0226, 0.12306],
  [18, -0.2637, 10.2315, 0.12309],
  [19, -0.2703, 10.4393, 0.12315],
  [20, -0.2762, 10.6464, 0.12323],
  [21, -0.2815, 10.8534, 0.12335],
  [22, -0.2862, 11.0608, 0.1235],
  [23, -0.2903, 11.2688, 0.12369],
  [24, -0.2941, 11.4775, 0.1239],
];

const LENGTH: LMSRow[] = [
  [0, 1, 49.1477, 0.0379],
  [1, 1, 53.6872, 0.0364],
  [2, 1, 57.0673, 0.03568],
  [3, 1, 59.8029, 0.0352],
  [4, 1, 62.0899, 0.03486],
  [5, 1, 64.0301, 0.03463],
  [6, 1, 65.7311, 0.03448],
  [7, 1, 67.2873, 0.03441],
  [8, 1, 68.7498, 0.0344],
  [9, 1, 70.1435, 0.03444],
  [10, 1, 71.4818, 0.03452],
  [11, 1, 72.771, 0.03464],
  [12, 1, 74.015, 0.03479],
  [13, 1, 75.2176, 0.03496],
  [14, 1, 76.3817, 0.03514],
  [15, 1, 77.5099, 0.03534],
  [16, 1, 78.6055, 0.03555],
  [17, 1, 79.671, 0.03576],
  [18, 1, 80.7079, 0.03598],
  [19, 1, 81.7182, 0.0362],
  [20, 1, 82.7036, 0.03643],
  [21, 1, 83.6654, 0.03666],
  [22, 1, 84.604, 0.03688],
  [23, 1, 85.5202, 0.03711],
  [24, 1, 86.4153, 0.03734],
];

const HEAD: LMSRow[] = [
  [0, 1, 33.8787, 0.03496],
  [1, 1, 36.5463, 0.0321],
  [2, 1, 38.2521, 0.03168],
  [3, 1, 39.5328, 0.0314],
  [4, 1, 40.5817, 0.03119],
  [5, 1, 41.459, 0.03102],
  [6, 1, 42.1995, 0.03087],
  [7, 1, 42.829, 0.03075],
  [8, 1, 43.3671, 0.03063],
  [9, 1, 43.83, 0.03053],
  [10, 1, 44.2319, 0.03044],
  [11, 1, 44.5844, 0.03035],
  [12, 1, 44.8965, 0.03027],
  [13, 1, 45.1752, 0.03019],
  [14, 1, 45.4265, 0.03012],
  [15, 1, 45.6551, 0.03006],
  [16, 1, 45.865, 0.02999],
  [17, 1, 46.0598, 0.02993],
  [18, 1, 46.2424, 0.02987],
  [19, 1, 46.4152, 0.02982],
  [20, 1, 46.5801, 0.02977],
  [21, 1, 46.7384, 0.02972],
  [22, 1, 46.8913, 0.02967],
  [23, 1, 47.0391, 0.02962],
  [24, 1, 47.1822, 0.02957],
];

const TABLES: Record<GrowthKind, LMSRow[]> = {
  weight: WEIGHT,
  length: LENGTH,
  head: HEAD,
};

// ── Unit conversions ──────────────────────────────────────────────────────
const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

export function lbOzToKg(lb: number, oz: number): number {
  return (lb + oz / 16) / LB_PER_KG;
}
export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}
export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}
export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}

// Fractional age in months from Annie's birthdate to `date` (YYYY-MM-DD).
// Uses the mean Gregorian month length so it lines up with the WHO monthly rows.
const DAYS_PER_MONTH = 365.25 / 12;
export function ageInMonths(date: string, born: string = ANNIE_BORN): number {
  const b = new Date(born + "T00:00:00").getTime();
  const d = new Date(date + "T00:00:00").getTime();
  return (d - b) / (1000 * 60 * 60 * 24) / DAYS_PER_MONTH;
}

// Linearly interpolate {L, M, S} at a fractional age, clamped to the table ends.
function lms(kind: GrowthKind, ageMonths: number): { L: number; M: number; S: number } {
  const rows = TABLES[kind];
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (ageMonths <= first[0]) return { L: first[1], M: first[2], S: first[3] };
  if (ageMonths >= last[0]) return { L: last[1], M: last[2], S: last[3] };
  let i = 0;
  while (i < rows.length - 1 && rows[i + 1][0] <= ageMonths) i++;
  const [a0, L0, M0, S0] = rows[i];
  const [a1, L1, M1, S1] = rows[i + 1];
  const t = (ageMonths - a0) / (a1 - a0);
  return {
    L: L0 + (L1 - L0) * t,
    M: M0 + (M1 - M0) * t,
    S: S0 + (S1 - S0) * t,
  };
}

function zScore(value: number, L: number, M: number, S: number): number {
  return L === 0 ? Math.log(value / M) / S : (Math.pow(value / M, L) - 1) / (L * S);
}

// Value at a given z-score — inverse of the LMS transform.
function valueAtZ(L: number, M: number, S: number, z: number): number {
  return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}

// Standard-normal CDF via an Abramowitz & Stegun erf approximation (|err| < 1.5e-7).
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  let p =
    d *
    t *
    (0.319381530 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  p = z > 0 ? 1 - p : p;
  return p;
}

/**
 * Percentile (0–100, rounded) for a metric `value` at `ageMonths`, or null if the
 * inputs are out of range. `value` is metric: kg for weight, cm for length/head.
 */
export function percentileFor(
  kind: GrowthKind,
  ageMonths: number,
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  if (!Number.isFinite(ageMonths) || ageMonths < 0) return null;
  const { L, M, S } = lms(kind, ageMonths);
  const pct = normalCdf(zScore(value, L, M, S)) * 100;
  return Math.max(0.1, Math.min(99.9, Math.round(pct * 10) / 10));
}

// The reference bands drawn behind Annie's line. z-scores for the WHO 3rd/15th/
// 50th/85th/97th percentiles.
export const REF_PERCENTILES = [
  { p: 3, z: -1.88079 },
  { p: 15, z: -1.03643 },
  { p: 50, z: 0 },
  { p: 85, z: 1.03643 },
  { p: 97, z: 1.88079 },
];

/**
 * For each reference percentile, the metric value at every whole month 0..maxMonths.
 * Returns points as {x: month, y: metricValue} for Chart.js.
 */
export function refCurves(
  kind: GrowthKind,
  maxMonths: number,
): { p: number; points: { x: number; y: number }[] }[] {
  const rows = TABLES[kind];
  const cap = Math.min(maxMonths, rows[rows.length - 1][0]);
  return REF_PERCENTILES.map(({ p, z }) => {
    const points: { x: number; y: number }[] = [];
    for (let m = 0; m <= cap; m++) {
      const { L, M, S } = lms(kind, m);
      points.push({ x: m, y: valueAtZ(L, M, S, z) });
    }
    return { p, points };
  });
}

// 25 -> "25th", 3 -> "3rd", 1 -> "1st". Rounds the percentile for display.
export function ordinal(n: number): string {
  const r = Math.round(n);
  const mod100 = r % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${r}th`;
  switch (r % 10) {
    case 1:
      return `${r}st`;
    case 2:
      return `${r}nd`;
    case 3:
      return `${r}rd`;
    default:
      return `${r}th`;
  }
}
