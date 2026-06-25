// Server-only Plaid client + mapping helpers. Never import this from client
// components — it reads PLAID_SECRET. Transactions and the access-token store
// are handled via the Admin SDK in the /api/plaid/* routes.
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  type Transaction as PlaidTransaction,
} from "plaid";
import type { FinanceCategory } from "@/lib/types";

export function plaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV || "sandbox") as keyof typeof PlaidEnvironments;
  if (!clientId || !secret) throw new Error("Missing PLAID_CLIENT_ID / PLAID_SECRET");
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: { headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret } },
    })
  );
}

// Map Plaid's personal_finance_category onto our budgeting buckets. Detailed
// codes win over the primary so groceries split out from eating out, and rent
// splits out from the rest of utilities (which fold into Subscription).
export function mapPlaidCategory(txn: PlaidTransaction): { category: FinanceCategory; excluded: boolean } {
  const primary = txn.personal_finance_category?.primary ?? "";
  const detailed = txn.personal_finance_category?.detailed ?? "";

  // Money-in (Plaid amount < 0) that Plaid tags as income.
  if (primary === "INCOME") return { category: "Income", excluded: false };

  // Card payments / internal transfers / loan payments — keep but exclude from totals.
  if (primary === "TRANSFER_IN" || primary === "TRANSFER_OUT" || primary === "LOAN_PAYMENTS") {
    return { category: "Transfer", excluded: true };
  }

  if (detailed === "FOOD_AND_DRINK_GROCERIES") return { category: "Groceries", excluded: false };
  if (primary === "FOOD_AND_DRINK") return { category: "Eating Out", excluded: false };
  if (primary === "TRANSPORTATION" || primary === "TRAVEL") return { category: "Travel", excluded: false };
  if (detailed === "RENT_AND_UTILITIES_RENT") return { category: "Rent", excluded: false };
  if (primary === "RENT_AND_UTILITIES") return { category: "Subscription", excluded: false };
  if (primary === "MEDICAL") return { category: "Health", excluded: false };

  // Amazon purchases (but not Prime subscription, caught as a service above/below).
  const who = `${txn.merchant_name || ""} ${txn.name || ""}`.toLowerCase();
  if (/\bamazon\b|amzn/.test(who) && !who.includes("prime")) {
    return { category: "Amazon", excluded: false };
  }

  // Everything else (general merchandise/services, personal care, entertainment,
  // home improvement, bank fees) → the discretionary catch-all.
  return { category: "Chase Discretionary", excluded: false };
}

// Convert a Plaid transaction into our Firestore FinanceTransaction doc fields.
// Plaid sign convention: amount POSITIVE = money out (expense). We store the
// opposite (negative = expense). Doc id = plaid_<transaction_id> for stable,
// idempotent dedupe across syncs.
// Best human-readable name Plaid can give: cleaned merchant name first, then an
// identified counterparty, then the raw bank descriptor (which may be masked).
export function plaidBestName(txn: PlaidTransaction): string {
  const counterparty = txn.counterparties?.find((c) => c.name)?.name;
  return txn.merchant_name || counterparty || txn.name || "Transaction";
}

export function plaidTxnToDoc(txn: PlaidTransaction, itemId: string, nowIso: string) {
  const { category, excluded } = mapPlaidCategory(txn);
  return {
    id: `plaid_${txn.transaction_id}`,
    data: {
      date: txn.date,
      month: txn.date.slice(0, 7),
      description: plaidBestName(txn),
      amount: -txn.amount, // flip Plaid's sign so expense is negative
      category,
      rawCategory: txn.personal_finance_category?.detailed || undefined,
      source: "plaid" as const,
      excluded,
      pending: txn.pending,
      plaidItemId: itemId,
      createdAt: nowIso,
    },
  };
}
