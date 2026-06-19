import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { CANONICAL_CATEGORIES, type CanonicalCategory } from "@lib/categories";
import { makeCorrectionKey, type CorrectionMap } from "./correction-lookup";
import { GENERIC_MERCHANT } from "./correction-lookup/constants";

// Provenance of a resolved category, surfaced so callers can persist it.
export type CategorizeSource = "lookup" | "signal" | "ai";
export type CategorizeResult = {
  category: CanonicalCategory;
  source: CategorizeSource;
};

// Fixed seed reduces run-to-run drift on the genuine ambiguous tail. temperature
// stays 0 and topP is left unset (a second stochastic axis would add variance).
const CATEGORIZE_SEED = 7;

export type CategorizeInput = {
  id: string;
  name: string;
  merchantName?: string | null;
  plaidCategory?: string[] | null;
  // Stored Plaid convention: expenses POSITIVE, revenue/deposits NEGATIVE
  // (money in ⇔ amount < 0). See draftReport.ts:140.
  amount?: number | null;
};

export type CategorizeExample = {
  name: string;
  plaidCategory?: string[] | null;
  category: CanonicalCategory;
};

export const FALLBACK_EXAMPLES: CategorizeExample[] = [
  {
    name: "Whole Foods Market",
    plaidCategory: ["Shops", "Supermarkets"],
    category: "Groceries",
  },
  {
    name: "Shell Gas Station",
    plaidCategory: ["Travel", "Gas Stations"],
    category: "Car",
  },
  {
    name: "Starbucks",
    plaidCategory: ["Food and Drink", "Coffee"],
    category: "Food & Drink",
  },
  {
    name: "Netflix",
    plaidCategory: ["Service", "Subscription"],
    category: "Bills & Utilities",
  },
  {
    name: "AMC Theatres",
    plaidCategory: ["Recreation", "Movies"],
    category: "Entertainment",
  },
  {
    name: "Ringling Museum",
    plaidCategory: ["Recreation", "Arts and Entertainment"],
    category: "Entertainment",
  },
  {
    name: "Sarasota Kayak Rentals",
    plaidCategory: ["Shops", "Equipment Rental"],
    category: "Entertainment",
  },
  {
    name: "YouFit Health Club",
    plaidCategory: ["Recreation", "Gyms and Fitness Centers"],
    category: "Health & Wellness",
  },
  {
    name: "Hilton Sarasota",
    plaidCategory: ["Travel", "Lodging"],
    category: "Entertainment",
  },
  {
    name: "Delta Airlines",
    plaidCategory: ["Travel", "Airlines and Aviation Services"],
    category: "Entertainment",
  },
  {
    name: "CVS Pharmacy",
    plaidCategory: ["Healthcare", "Pharmacy"],
    category: "Health & Wellness",
  },
  {
    name: "Amazon.com",
    plaidCategory: ["Shops", "Digital Purchase"],
    category: "Shopping",
  },
  {
    name: "Bank Service Fee",
    plaidCategory: ["Bank Fees"],
    category: "Fees & Adjustments",
  },
  {
    name: "ACME Corp Payroll",
    plaidCategory: ["Transfer", "Payroll"],
    category: "Revenue",
  },
  {
    name: "Spotify",
    plaidCategory: ["Service", "Subscription"],
    category: "Bills & Utilities",
  },
];

export const MIN_USER_EXAMPLES = 5;
export const MAX_USER_EXAMPLES = 30;

// Schema places `reasoning` BEFORE `category` so structured-output ordering
// forces the model to commit to a rule (e.g. "Plaid leaf Travel/Lodging →
// hotel rule → Entertainment") before naming the category. On weaker models
// this materially improves rule adherence — without it, nano routinely
// violates "ALWAYS" rules under merchant-name distractors.
const ResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      reasoning: z.string(),
      category: z.enum(CANONICAL_CATEGORIES),
    }),
  ),
});

// Deterministic pre-filter: bypass the model when signals are unambiguous.
// Eliminates failures where the model violates "ALWAYS" prompt rules under
// merchant-name distractors (e.g. a Shell gas station tagged Revenue).
//
// Revenue uses amount < 0 as a STRICT GATE (stored revenue/deposits are
// negative). Without it, name-only matches would mis-classify B2B vendor
// expenses like "ADP Fees", "Gusto Subscription", or "Payroll Services Inc"
// (positive amounts) as inflow. Inside the gate we accept any of:
//   - Plaid leaf: payroll, deposit, interest
//   - Name regex: ADP/Gusto/Paychex/PAYROLL/SALARY/DIRECT DEP
//   - Plaid root 'Transfer' (deposit-shaped, e.g. Venmo cash-in)
//   - Refund leaf with NO merchant (generic refunds; refund + merchant defers
//     to the LLM so e.g. an Amazon refund stays in Shopping per UX expectation)
//
// Outflow shortcuts use leaf substrings (not strict equality) so singular/plural
// and Plaid taxonomy drift don't break the match. Scoped to Plaid leaves only
// — never raw merchant names — to avoid the "Payroll Services Inc" trap.
const REVENUE_NAME = /\b(payroll|salary|direct dep|adp|gusto|paychex)\b/i;

export function detectStrongSignal(
  t: Pick<
    CategorizeInput,
    "plaidCategory" | "name" | "amount" | "merchantName"
  >,
): CanonicalCategory | null {
  const path = (t.plaidCategory ?? []).map((s) => s.toLowerCase());
  const leaf = path[path.length - 1] ?? "";
  const root = path[0] ?? "";
  const isInflow = typeof t.amount === "number" && t.amount < 0;
  const hasMerchant = !!t.merchantName?.trim();

  if (isInflow) {
    if (leaf.includes("payroll")) return "Revenue";
    if (leaf.includes("deposit")) return "Revenue";
    if (leaf.includes("interest")) return "Revenue";
    if (root === "transfer") return "Revenue";

    if (leaf.includes("refund")) {
      if (!hasMerchant) return "Revenue";

      const merchant = t.merchantName ?? "";

      const isGeneric = GENERIC_MERCHANT.test(merchant);

      const isStrongConsumerBrand =
        /amazon|target|walmart|delta|united|hilton|marriott|starbucks|mcdonald/i.test(
          merchant,
        );

      if (isGeneric || !isStrongConsumerBrand) {
        return "Revenue";
      }

      // else → defer to LLM
    }

    if (REVENUE_NAME.test(t.name)) return "Revenue";
  }

  if (leaf.includes("lodging")) return "Entertainment";
  if (leaf.includes("airlines")) return "Entertainment";
  if (leaf.includes("supermarket") || leaf.includes("grocery"))
    return "Groceries";
  if (leaf.includes("gym")) return "Health & Wellness";
  if (leaf.includes("pharm")) return "Health & Wellness";
  if (leaf.includes("subscription")) return "Bills & Utilities";
  if (
    leaf.includes("gas station") ||
    leaf.includes("parking") ||
    leaf.includes("tolls") ||
    leaf.includes("auto repair")
  )
    return "Car";
  return null;
}

function formatExample(e: CategorizeExample): string {
  const plaid = e.plaidCategory?.join(" / ") || "";
  return `- "${e.name}" [${plaid}] => ${e.category}`;
}

function formatTarget(t: CategorizeInput): string {
  const plaid = t.plaidCategory?.join(" / ") || "";
  const merchantTrimmed = t.merchantName?.trim();
  const merchant = merchantTrimmed ? ` (merchant: ${merchantTrimmed})` : "";
  // Surface signed amount so the model can read inflow/outflow direction.
  const amount =
    typeof t.amount === "number"
      ? ` amount=${t.amount > 0 ? "+" : ""}${t.amount.toFixed(2)}`
      : "";
  return `id=${t.id} | "${t.name}"${merchant} [${plaid}]${amount}`;
}

export async function categorizeBatch(
  transactions: CategorizeInput[],
  examples: CategorizeExample[],
  correctionMap?: CorrectionMap,
): Promise<Map<string, CategorizeResult>> {
  if (transactions.length === 0) return new Map();

  // Precedence: user-correction lookup (deterministic ground truth) → strong
  // signal (deterministic rule) → LLM. Only residual reaches the model.
  const out = new Map<string, CategorizeResult>();
  const residual: CategorizeInput[] = [];
  for (const t of transactions) {
    if (correctionMap) {
      const key = makeCorrectionKey(t);
      const hit = key ? correctionMap.get(key) : undefined;
      if (hit) {
        out.set(t.id, { category: hit, source: "lookup" });
        continue;
      }
    }
    const signal = detectStrongSignal(t);
    if (signal) {
      out.set(t.id, { category: signal, source: "signal" });
      continue;
    }
    residual.push(t);
  }

  if (residual.length === 0) return out;

  const system = [
    "You categorize bank transactions into EXACTLY ONE bucket from this list:",
    CANONICAL_CATEGORIES.join(", "),
    "",
    "Plaid taxonomy is descriptive, not prescriptive. Map by PURPOSE, not merchant industry — e.g. gas station => Car (not Travel); hotel => Entertainment (not Bills).",
    "",
    "DECISION ORDER — apply in this exact order; STOP at the first match. If multiple rules could apply, the more specific rule wins (e.g. Gyms and Fitness Centers beats generic Recreation).",
    "",
    "1) USER HISTORY",
    "   If a similar merchant appears in the examples below, use that example's category.",
    "",
    "2) FLOW DETECTION (HIGHEST PRIORITY)",
    "   `amount` is the GATE: Revenue requires amount < 0 (money in / deposit). amount >= 0 means outflow — skip to step 3 and NEVER return Revenue, no matter what the name says ('ADP Fees', 'Gusto Subscription', 'Payroll Services Inc' are all vendor expenses with positive amounts).",
    "   When amount < 0, classify as Revenue and STOP if ANY of these hold:",
    "   - Plaid leaf contains 'Payroll', 'Deposit', or 'Interest', OR",
    "   - Name contains PAYROLL, SALARY, DIRECT DEP, ADP, GUSTO, or PAYCHEX (case-insensitive), OR",
    "   - Plaid root is 'Transfer' (deposit-shaped inflow, e.g. Venmo/Zelle cash-in).",
    "   REFUND NUANCE: an inflow with leaf 'Refund' AND a recognizable consumer merchant (Amazon, Target, restaurant chain, airline) belongs back to the merchant's original category — Amazon refund => Shopping, restaurant refund => Food & Drink, airline refund => Entertainment. Only generic refunds with no merchant context (insurance payout, government refund) are Revenue.",
    "",
    "3) PLAID LEAF (the last segment of the path shown in [brackets], case-insensitive)",
    "   TRAVEL — any 'Travel / *' leaf is Entertainment, EXCEPT these vehicle-of-self leaves which are Car: 'Gas Stations', 'Parking', 'Tolls and Fees', 'Auto Repair'.",
    "   Anchor: 'Travel / Lodging' and any hotel are Entertainment (NEVER Bills & Utilities, even if recurring).",
    "",
    "   RECREATION — split by sub-type, not blanket:",
    "   - Gyms / fitness centers => Health & Wellness.",
    "   - Physical-goods retailers ('Sports Equipment Store', 'Hobby Shop', sporting goods stores, recreational retail) => Shopping. The customer bought a product, not an experience.",
    "   - Everything else under 'Recreation / *' (events, venues, activities, museums, movies, arts, attractions) => Entertainment.",
    "",
    "   'Shops / Equipment Rental' (kayaks, bikes, recreational gear) => Entertainment (paying to use it, not to own it).",
    "",
    "   Health & wellness:",
    "   - 'Healthcare / *', pharmacy, medical, dental, vision => Health & Wellness",
    "",
    "   Food:",
    "   - leaf containing 'Supermarkets', 'Groceries', or produce/butcher/fruit shops => Groceries",
    "   - 'Food and Drink / *' (restaurants, cafes, bars, fast food, coffee, delivery) => Food & Drink",
    "",
    "   Shopping:",
    "   - 'Shops / *' not covered above (incl. 'Digital Purchase', clothing, electronics, online retail) => Shopping",
    "",
    "   Recurring household services → Bills & Utilities (and ONLY these):",
    "   - 'Service / Subscription', recurring streaming/internet/phone/electric/water/gas-utility => Bills & Utilities",
    "",
    "   Fees:",
    "   - 'Bank Fees / *', overdraft, ATM fee, late fee, FX fee => Fees & Adjustments",
    "",
    "   Foster (animal welfare ONLY):",
    "   - Humane Society, ASPCA, animal rescue/shelter, pet adoption => Foster",
    "",
    "   Transfers (NOT Revenue, NOT Bills):",
    "   - 'Payment / Credit Card', 'Transfer / Debit', 'Transfer / Credit' (any non-payroll transfer) => Others",
    "",
    "4) MERCHANT NAME (can override Plaid when ANY of these hold):",
    "   - the Plaid leaf is missing, OR",
    "   - the Plaid leaf is generic ('Misc', 'Other', 'General', 'Unknown', 'Other Services'), OR",
    "   - the merchant is a globally recognizable brand whose category is unambiguous: hotel (Hilton/Marriott/Hyatt/Holiday Inn), airline (Delta/United/American/Southwest), gas (Shell/Chevron/Exxon/BP), gym (YouFit/Planet Fitness/Equinox/LA Fitness).",
    "   In all three cases, prefer the merchant-derived category over the Plaid leaf. Otherwise Plaid wins. Do NOT override on weak/unfamiliar merchant signals.",
    "",
    "5) DEFAULT",
    "   Others — last resort, only if no rule above applies. Do NOT default to Others when a Plaid leaf rule matches.",
    "",
    "AMBIGUITY TIE-BREAKER (after specificity):",
    "   If two rules still match equally, choose the category that best reflects the user's spending intent — what they were trying to do with the money — not the merchant's industry classification.",
    "",
    "HARD NEGATIVE RULES — these override anything else (except user history):",
    "- Revenue requires amount < 0 (money in). A positive-amount (or zero) row is NEVER Revenue, even if its name contains 'PAYROLL'/'SALARY'/'ADP'/'GUSTO'/'PAYCHEX' — those are vendor expenses (e.g. 'ADP Fees', 'Gusto Subscription', 'Payroll Services Inc').",
    "- Refunds tied to a recognizable consumer merchant follow the merchant's category, NOT Revenue (Amazon refund => Shopping; restaurant refund => Food & Drink).",
    "- Hotels and short-term lodging are ALWAYS Entertainment, NEVER Bills & Utilities, even if recurring or with weird names.",
    "- Gyms / fitness centers are Health & Wellness, NEVER Entertainment, even though Plaid files them under Recreation.",
    "- Sports Equipment Store / Hobby Shop and other physical-goods retailers under 'Recreation' are Shopping, NEVER Entertainment.",
    "- Equipment rentals (kayaks, bikes, skis, etc.) are Entertainment, NEVER Groceries or Shopping.",
    "- Foster is animal-welfare donations ONLY. Other charities/non-profits => Personal.",
    "",
    "REASONING FIELD INSTRUCTIONS:",
    'For each transaction, before naming the category, write ONE short sentence in `reasoning` stating which rule applied — e.g. "Plaid leaf Travel/Lodging → hotel rule → Entertainment" or "User history: similar to Whole Foods → Groceries". Keep it under 20 words.',
  ].join("\n");

  const prompt = [
    "Examples (user history first, then fallback):",
    examples.map(formatExample).join("\n"),
    "",
    "Categorize each of these transactions. Return one entry per id, no duplicates, no extras:",
    residual.map(formatTarget).join("\n"),
  ].join("\n");

  const { output } = await generateText({
    model: openai("gpt-4.1-nano"),
    output: Output.object({ schema: ResultSchema }),
    temperature: 0,
    seed: CATEGORIZE_SEED,
    system,
    prompt,
  });

  const inputIds = new Set(residual.map((t) => t.id));
  for (const r of output.results) {
    if (!inputIds.has(r.id)) {
      console.warn(`Unexpected id in model output: ${r.id}`);
      continue;
    }
    if (out.has(r.id)) {
      console.warn(`Duplicate id in model output: ${r.id}`);
      continue;
    }
    out.set(r.id, { category: r.category, source: "ai" });
  }
  return out;
}
