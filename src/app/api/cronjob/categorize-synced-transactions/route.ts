import { NextResponse } from "next/server";
import prisma from "@lib/prisma/prismaClient";
import { categorizeForUser, MIN_TRANSACTION_DATE } from "@lib/ai/categorizeForUser";
import { upsertCurrentMonthDraftReport } from "@lib/reports/draftReport";
import { checkThresholdsAndNotify } from "@lib/notifications/thresholdCheck";

export const maxDuration = 60;

const MAX_ROWS_PER_RUN = 200;

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

    // Find all users with at least one pending uncategorized row, then run
    // the per-user helper. Total rows across all users still capped by
    // MAX_ROWS_PER_RUN (split evenly is overkill — first-come basis is fine).
    const userIds = (
      await prisma.syncedTransaction.findMany({
        where: {
          userCategoryOverride: null,
          userSoftDeleted: false,
          date: { gte: MIN_TRANSACTION_DATE },
        },
        select: { userId: true },
        distinct: ["userId"],
      })
    ).map((r) => r.userId);

    if (userIds.length === 0) {
      console.log("No transactions need categorization.");
      return NextResponse.json({ processed: 0 }, { status: 200 });
    }

    let totalUpdated = 0;
    let totalFailed = 0;
    let usersTouched = 0;

    for (const userId of userIds) {
      const remaining = MAX_ROWS_PER_RUN - totalUpdated - totalFailed;
      if (remaining <= 0) break;

      const result = await categorizeForUser(userId, { maxRows: remaining });
      totalUpdated += result.updated;
      totalFailed += result.failed;

      if (result.updated > 0) {
        usersTouched++;
        try {
          const now = new Date();
          await upsertCurrentMonthDraftReport(userId, now);
          await checkThresholdsAndNotify(userId, now);
        } catch (err) {
          console.error(
            `[categorize-cron] post-categorize work failed for user=${userId}:`,
            err
          );
        }
      }
    }

    console.log(
      `Categorized ${totalUpdated} rows across ${usersTouched} users (failed: ${totalFailed}).`
    );

    return NextResponse.json(
      { processed: totalUpdated, failed: totalFailed, users: usersTouched },
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
