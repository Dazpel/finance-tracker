import prisma from "@lib/prisma/prismaClient";
import {
  categorizeBatch,
  type CategorizeExample,
  type CategorizeInput,
  type CategorizeResult,
  FALLBACK_EXAMPLES,
  MIN_USER_EXAMPLES,
  MAX_USER_EXAMPLES,
} from "@lib/ai/categorize";
import {
  buildCorrectionMap,
  type GroundTruthRow,
} from "@lib/ai/correction-lookup";
import { selectBalancedExamples } from "@lib/ai/exampleSelection";
import { isCanonicalCategory, type CanonicalCategory } from "@lib/categories";
import { LOCAL_ACCOUNT_ID } from "utils/constants";

const DEFAULT_MAX_ROWS = 200;
const CHUNK_SIZE = 40;
// Pull a generous slice of ground truth; the map/example builders dedupe and
// cap. Bounded so a heavy corrector doesn't load unbounded rows per run.
const GROUND_TRUTH_LIMIT = 500;
// Per-category example cap — kills majority-label bias toward a dominant class.
const PER_CATEGORY_CAP = 6;
// Skip pre-launch backfill: those reports have already been generated, so
// categorizing them now would burn tokens with no downstream effect.
export const MIN_TRANSACTION_DATE = "2026-04-01";

export type CategorizeForUserResult = {
  updated: number;
  failed: number;
  pendingCount: number;
};

// Pulls all uncategorized SyncedTransaction rows for `userId`, runs the AI
// categorization in chunks, and writes back via prisma.syncedTransaction.updateMany.
// DOES NOT call upsertCurrentMonthDraftReport or threshold notifications — callers
// are responsible for follow-on work. This separation lets the mobile sync endpoint
// skip notifications while the cron path keeps them.
export async function categorizeForUser(
  userId: string,
  opts?: { maxRows?: number }
): Promise<CategorizeForUserResult> {
  const maxRows = opts?.maxRows ?? DEFAULT_MAX_ROWS;

  const pending = await prisma.syncedTransaction.findMany({
    where: {
      userId,
      userCategoryOverride: null,
      userSoftDeleted: false,
      date: { gte: MIN_TRANSACTION_DATE },
    },
    orderBy: { createdAt: "asc" },
    take: maxRows,
    select: {
      id: true,
      name: true,
      merchant_name: true,
      category: true,
      amount: true,
    },
  });

  if (pending.length === 0) {
    return { updated: 0, failed: 0, pendingCount: 0 };
  }

  // Ground truth = actively-chosen categories only: synced rows the user
  // explicitly corrected (categorySource 'user'), plus manually-authored
  // report transactions (account_id = LOCAL_ACCOUNT_ID). Passively-approved
  // AI guesses are deliberately excluded so we never learn from machine error.
  const [syncedCorrections, manualTxns] = await Promise.all([
    prisma.syncedTransaction.findMany({
      where: { userId, categorySource: "user", userSoftDeleted: false },
      orderBy: { createdAt: "desc" },
      take: GROUND_TRUTH_LIMIT,
      select: {
        merchant_name: true,
        name: true,
        amount: true,
        userCategoryOverride: true,
        createdAt: true,
      },
    }),
    prisma.transaction.findMany({
      where: { userId, account_id: LOCAL_ACCOUNT_ID },
      orderBy: { createdAt: "desc" },
      take: GROUND_TRUTH_LIMIT,
      select: { name: true, amount: true, category: true, createdAt: true },
    }),
  ]);

  const groundTruth: GroundTruthRow[] = [
    ...syncedCorrections.flatMap((r) =>
      r.userCategoryOverride && isCanonicalCategory(r.userCategoryOverride)
        ? [
            {
              merchantName: r.merchant_name,
              name: r.name,
              amount: r.amount,
              category: r.userCategoryOverride,
              createdAt: r.createdAt,
            },
          ]
        : []
    ),
    ...manualTxns.flatMap((r) => {
      const label = r.category[0];
      return label && isCanonicalCategory(label)
        ? [
            {
              merchantName: null,
              name: r.name,
              amount: r.amount,
              category: label,
              createdAt: r.createdAt,
            },
          ]
        : [];
    }),
  ];

  const correctionMap = buildCorrectionMap(groundTruth);

  const userExamples: CategorizeExample[] = groundTruth.map((g) => ({
    name: g.name,
    category: g.category,
  }));

  const examples = selectBalancedExamples(userExamples, FALLBACK_EXAMPLES, {
    minUser: MIN_USER_EXAMPLES,
    max: MAX_USER_EXAMPLES,
    perCategoryCap: PER_CATEGORY_CAP,
  });

  let totalUpdated = 0;
  let totalFailed = 0;

  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const chunk = pending.slice(i, i + CHUNK_SIZE);
    const inputs: CategorizeInput[] = chunk.map((r) => ({
      id: r.id,
      name: r.name,
      merchantName: r.merchant_name,
      plaidCategory: r.category,
      amount: r.amount,
    }));

    let assignments: Map<string, CategorizeResult>;
    try {
      assignments = await categorizeBatch(inputs, examples, correctionMap);
    } catch (err) {
      console.error(`[categorizeForUser] AI batch failed user=${userId}:`, err);
      totalFailed += chunk.length;
      continue;
    }

    const missingIds = chunk
      .filter((r) => !assignments.has(r.id))
      .map((r) => r.id);
    if (missingIds.length > 0) {
      console.error(
        `[categorizeForUser] Model omitted ids for user=${userId}: ${missingIds.join(",")}`
      );
    }

    // Group by (category, source) so each updateMany persists both the
    // resolved category and its provenance.
    const byCatSource = new Map<
      string,
      { category: CanonicalCategory; source: CategorizeResult["source"]; ids: string[] }
    >();
    for (const r of chunk) {
      // Fallback to "Others"/ai when the model omits an id so the row exits the
      // pending pool and we don't re-spend tokens on it forever.
      const res: CategorizeResult = assignments.get(r.id) ?? {
        category: "Others",
        source: "ai",
      };
      const k = `${res.category}|${res.source}`;
      const entry = byCatSource.get(k) ?? {
        category: res.category,
        source: res.source,
        ids: [],
      };
      entry.ids.push(r.id);
      byCatSource.set(k, entry);
    }

    for (const { category, source, ids } of byCatSource.values()) {
      try {
        const { count } = await prisma.syncedTransaction.updateMany({
          where: { id: { in: ids } },
          data: { userCategoryOverride: category, categorySource: source },
        });
        totalUpdated += count;
        if (count < ids.length) totalFailed += ids.length - count;
      } catch (err) {
        console.error(
          `[categorizeForUser] DB update failed user=${userId} category=${category}:`,
          err
        );
        totalFailed += ids.length;
      }
    }
  }

  return {
    updated: totalUpdated,
    failed: totalFailed,
    pendingCount: pending.length,
  };
}
