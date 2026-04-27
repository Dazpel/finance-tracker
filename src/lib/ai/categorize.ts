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
    "You categorize bank transactions into one of these exact buckets:",
    CANONICAL_CATEGORIES.join(", "),
    "Rules:",
    "- Pick the single closest bucket. If nothing fits, use Others.",
    "- Subscriptions and recurring services (streaming, internet, phone) => Bills & Utilities.",
    "- Restaurants, cafes, bars, delivery => Food & Drink. Supermarkets/grocers => Groceries.",
    "- Gas, auto repair, parking, rideshare for vehicle => Car.",
    "- Bank/card fees, overdrafts, adjustments => Fees & Adjustments.",
    "- Payroll, deposits, refunds, interest income => Revenue.",
    "- Match the user's historical preferences shown in the examples; their labels override generic intuition.",
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
