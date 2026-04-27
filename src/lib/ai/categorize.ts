import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { CANONICAL_CATEGORIES, type CanonicalCategory } from "@lib/categories";

export type CategorizeInput = {
  id: string;
  name: string;
  merchantName?: string | null;
  plaidCategory?: string[] | null;
};

export type CategorizeExample = {
  name: string;
  plaidCategory?: string[] | null;
  category: CanonicalCategory;
};

// Used when a user has fewer than MIN_USER_EXAMPLES historical labels.
const FALLBACK_EXAMPLES: CategorizeExample[] = [
  { name: "Whole Foods Market", plaidCategory: ["Shops", "Supermarkets"], category: "Groceries" },
  { name: "Shell Gas Station", plaidCategory: ["Travel", "Gas Stations"], category: "Car" },
  { name: "Starbucks", plaidCategory: ["Food and drink", "Coffee"], category: "Food & Drink" },
  { name: "Netflix", plaidCategory: ["Service", "Subscription"], category: "Bills & Utilities" },
  { name: "AMC Theatres", plaidCategory: ["Recreation", "Movies"], category: "Entertainment" },
  { name: "CVS Pharmacy", plaidCategory: ["Healthcare", "Pharmacy"], category: "Health & Wellness" },
  { name: "Amazon.com", plaidCategory: ["Shops", "Digital Purchase"], category: "Shopping" },
  { name: "Bank Service Fee", plaidCategory: ["Bank Fees"], category: "Fees & Adjustments" },
  { name: "Payroll Deposit", plaidCategory: ["Transfer", "Payroll"], category: "Revenue" },
  { name: "Spotify", plaidCategory: ["Service", "Subscription"], category: "Bills & Utilities" },
];

const MIN_USER_EXAMPLES = 5;
const MAX_USER_EXAMPLES = 30;

const ResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      category: z.enum(CANONICAL_CATEGORIES),
    })
  ),
});

function formatExample(e: CategorizeExample): string {
  const plaid = e.plaidCategory?.join(" / ") || "";
  return `- "${e.name}" [${plaid}] => ${e.category}`;
}

function formatTarget(t: CategorizeInput): string {
  const plaid = t.plaidCategory?.join(" / ") || "";
  const merchant = t.merchantName ? ` (merchant: ${t.merchantName})` : "";
  return `id=${t.id} | "${t.name}"${merchant} [${plaid}]`;
}

export async function categorizeBatch(
  transactions: CategorizeInput[],
  userExamples: CategorizeExample[]
): Promise<Map<string, CanonicalCategory>> {
  if (transactions.length === 0) return new Map();

  const examples =
    userExamples.length >= MIN_USER_EXAMPLES
      ? userExamples.slice(0, MAX_USER_EXAMPLES)
      : [...userExamples, ...FALLBACK_EXAMPLES].slice(0, MAX_USER_EXAMPLES);

  const system = [
    "You categorize bank transactions into exactly one of these buckets:",
    CANONICAL_CATEGORIES.join(", "),
    "",
    "Plaid categories are the PRIMARY signal. The full Plaid path is shown in [brackets] after each merchant. Map by the Plaid leaf first; only use the merchant name when Plaid is missing or ambiguous. Match Plaid category names case-insensitively (e.g., 'Food and Drink' and 'Food and drink' are the same).",
    "",
    "Plaid leaf → bucket mapping:",
    "- Any leaf containing 'Gas Stations' (even under 'Travel') => Car",
    "- 'Travel / Lodging' OR any merchant whose name contains 'hotel', 'motel', 'inn', 'resort', 'lodge', 'suites', 'hostel', 'airbnb', 'vrbo', 'marriott', 'hilton', 'hyatt', 'sheraton' => Entertainment (ALWAYS — never Bills & Utilities, even if it looks recurring)",
    "- 'Travel / *' for flights, taxi, rideshare, public transit => Entertainment",
    "- Any leaf containing 'Supermarkets', 'Groceries', or produce/butcher/fruit shops => Groceries",
    "- 'Food and Drink / *' (restaurants, cafes, bars, fast food, coffee, delivery) => Food & Drink",
    "- 'Shops / *' that is not a grocery, pharmacy, or gas station (incl. 'Digital Purchase', clothing, electronics, online retail like Amazon) => Shopping",
    "- 'Recreation / *' or 'Entertainment / *' => Entertainment",
    "- 'Healthcare / *', pharmacy, medical, dental, vision => Health & Wellness",
    "- 'Service / Subscription' or recurring streaming/internet/phone/electric/water/gas-utility => Bills & Utilities (this is for RECURRING household utilities and subscriptions only — NOT hotels, NOT short-term lodging)",
    "- 'Transfer / Payroll' => Revenue (ALWAYS — ignore the merchant name; payroll deposits often have weird employer names)",
    "- 'Deposit', 'Interest Earned', refunds, reimbursements, tax refunds => Revenue",
    "- 'Payment / Credit Card', 'Transfer / Debit', 'Transfer / Credit' (any non-payroll transfer) => Others",
    "- 'Bank Fees / *', overdraft, ATM fee, late fee, FX fee => Fees & Adjustments",
    "- Animal-welfare orgs (Humane Society, ASPCA, animal rescue/shelter, pet adoption) => Foster",
    "",
    "Hard rules:",
    "- Revenue is for INFLOWS only. Never assign Revenue to a shop, restaurant, gas station, hotel, or any merchant where money was spent.",
    "- Foster is for animal-welfare donations only. Other charities/non-profits with no animal context => Personal.",
    "- Use Others ONLY when no Plaid leaf above matches AND the merchant name gives no clear signal. Do NOT default to Others when a specific Plaid leaf is present.",
    "- Hotels and short-term lodging are Entertainment, never Bills & Utilities. Bills & Utilities is reserved for recurring household services (electric, water, gas-utility, internet, phone, streaming subscriptions).",
    "- The user's history examples override these defaults when the same merchant appears in their history.",
  ].join("\n");

  const prompt = [
    "Examples (user history first, then fallback):",
    examples.map(formatExample).join("\n"),
    "",
    "Categorize each of these transactions. Return one entry per id, no duplicates, no extras:",
    transactions.map(formatTarget).join("\n"),
  ].join("\n");

  const { output } = await generateText({
    model: openai("gpt-4.1-nano"),
    output: Output.object({ schema: ResultSchema }),
    temperature: 0,
    system,
    prompt,
  });

  const inputIds = new Set(transactions.map((t) => t.id));
  const out = new Map<string, CanonicalCategory>();
  for (const r of output.results) {
    if (!inputIds.has(r.id)) {
      console.warn(`Unexpected id in model output: ${r.id}`);
      continue;
    }
    if (out.has(r.id)) {
      console.warn(`Duplicate id in model output: ${r.id}`);
      continue;
    }
    out.set(r.id, r.category);
  }
  return out;
}
