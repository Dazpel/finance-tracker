import prisma from "@lib/prisma/prismaClient";
import {
  categorizeBatch,
  type CategorizeExample,
  type CategorizeInput,
} from "@lib/ai/categorize";
import { isCanonicalCategory, type CanonicalCategory } from "@lib/categories";

const DEFAULT_MAX_ROWS = 200;
const CHUNK_SIZE = 40;
const USER_HISTORY_LIMIT = 30;
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

  const history = await prisma.transaction.findMany({
    where: { userId, category: { isEmpty: false } },
    orderBy: { date: "desc" },
    take: USER_HISTORY_LIMIT,
    select: { name: true, category: true },
  });

  const userExamples: CategorizeExample[] = history
    .map((h) => {
      const label = h.category[0];
      return label && isCanonicalCategory(label)
        ? { name: h.name, category: label }
        : null;
    })
    .filter((e): e is CategorizeExample => e !== null);

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

    let assignments: Map<string, CanonicalCategory>;
    try {
      assignments = await categorizeBatch(inputs, userExamples);
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

    const byCategory = new Map<CanonicalCategory, string[]>();
    for (const r of chunk) {
      // Fallback to "Others" when the model omits an id so the row exits the
      // pending pool and we don't re-spend tokens on it forever.
      const category: CanonicalCategory = assignments.get(r.id) ?? "Others";
      const list = byCategory.get(category) ?? [];
      list.push(r.id);
      byCategory.set(category, list);
    }

    for (const [category, ids] of byCategory) {
      try {
        const { count } = await prisma.syncedTransaction.updateMany({
          where: { id: { in: ids } },
          data: { userCategoryOverride: category },
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
