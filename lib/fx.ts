// USD → MXN conversion for the monthly recap (Sarah reads the numbers in pesos).
// Live rate is fetched at send time from a free, no-key endpoint; if that fails we
// fall back to a constant so the email always renders.

const FALLBACK_USD_MXN = Number(process.env.FX_USD_MXN_FALLBACK) || 18.5;

// Fetch the current USD→MXN rate. Never throws — returns the fallback on any error.
export async function getUsdToMxn(): Promise<number> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      // Rates move slowly; let the platform cache for an hour.
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
    const json = (await res.json()) as { result?: string; rates?: { MXN?: number } };
    const rate = json?.rates?.MXN;
    if (json?.result === "success" && typeof rate === "number" && rate > 0) return rate;
    throw new Error("FX payload missing MXN");
  } catch (err) {
    console.error("getUsdToMxn fell back to constant:", err);
    return FALLBACK_USD_MXN;
  }
}

// Format a USD amount as its peso equivalent, e.g. "≈ $208,900 MXN".
export function fmtMXN(usd: number, rate: number): string {
  const pesos = Math.round(usd * rate);
  return `≈ $${pesos.toLocaleString("en-US")} MXN`;
}
