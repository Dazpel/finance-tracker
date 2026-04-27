import { NextResponse } from "next/server";
import prisma from "@lib/prisma/prismaClient";
import {
  categorizeBatch,
  type CategorizeExample,
  type CategorizeInput,
} from "@lib/ai/categorize";
import { isCanonicalCategory, type CanonicalCategory } from "@lib/categories";

export const maxDuration = 60;

const MAX_ROWS_PER_RUN = 200;
const CHUNK_SIZE = 40;
const USER_HISTORY_LIMIT = 30;
// Skip pre-launch backfill: those reports have already been generated, so
// categorizing them now would burn tokens with no downstream effect.
const MIN_TRANSACTION_DATE = "2026-04-01";

export async function POST(request: Request) {
  const initTimer = Date.now();
  try {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured");
      return NextResponse.json(
        { message: "Server misconfiguration" },
        { status: 500 }
      );
    }
    if (
      request.headers.get("Authorization") !==
      `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json(
        { message: "Invalid authorization header" },
        { status: 401 }
      );
    }

    console.log("-----------------------------------");
    console.log("------- AI categorize synced transactions -------");
    console.log("-----------------------------------");

    const pending = await prisma.syncedTransaction.findMany({
      where: {
        userCategoryOverride: null,
        userSoftDeleted: false,
        date: { gte: MIN_TRANSACTION_DATE },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_ROWS_PER_RUN,
      select: {
        id: true,
        userId: true,
        name: true,
        merchant_name: true,
        category: true,
      },
    });

    if (pending.length === 0) {
      console.log("No transactions need categorization.");
      return NextResponse.json({ processed: 0 }, { status: 200 });
    }

    const byUser = new Map<string, typeof pending>();
    for (const row of pending) {
      const list = byUser.get(row.userId) ?? [];
      list.push(row);
      byUser.set(row.userId, list);
    }

    let totalUpdated = 0;
    let totalFailed = 0;

    for (const [userId, rows] of byUser) {
      // Pull user's labeled history from Transaction (legacy data with curated category[0]).
      const history = await prisma.transaction.findMany({
        where: {
          userId,
          category: { isEmpty: false },
        },
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

      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const inputs: CategorizeInput[] = chunk.map((r) => ({
          id: r.id,
          name: r.name,
          merchantName: r.merchant_name,
          plaidCategory: r.category,
        }));

        let assignments: Map<string, CanonicalCategory>;
        try {
          assignments = await categorizeBatch(inputs, userExamples);
        } catch (err) {
          console.error(`AI categorize failed for user=${userId}:`, err);
          totalFailed += chunk.length;
          continue;
        }

        const missingIds = chunk
          .filter((r) => !assignments.has(r.id))
          .map((r) => r.id);
        if (missingIds.length > 0) {
          console.error(
            `Model omitted ids for user=${userId}: ${missingIds.join(",")}`
          );
        }

        const writes = chunk.map((r) => {
          // Fallback to "Others" when the model omits an id so the row exits
          // the pending pool and the cron doesn't re-spend tokens on it forever.
          const category: CanonicalCategory = assignments.get(r.id) ?? "Others";
          return prisma.syncedTransaction
            .update({
              where: { id: r.id },
              data: { userCategoryOverride: category },
            })
            .then(() => ({ ok: true as const, id: r.id }))
            .catch((err) => {
              console.error(`DB update failed for id=${r.id}:`, err);
              return { ok: false as const, id: r.id };
            });
        });

        const results = await Promise.all(writes);
        for (const res of results) {
          if (res.ok) totalUpdated += 1;
          else totalFailed += 1;
        }
      }
    }

    console.log(
      `Categorized ${totalUpdated} rows across ${byUser.size} users (failed: ${totalFailed}).`
    );

    return NextResponse.json(
      {
        processed: totalUpdated,
        failed: totalFailed,
        users: byUser.size,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    console.log(`Time taken: ${Date.now() - initTimer}ms`);
  }
}
