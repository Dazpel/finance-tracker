import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";
import { syncTransactionsForAccount } from "@lib/plaid/syncTransactions";
import { categorizeForUser } from "@lib/ai/categorizeForUser";
import { upsertCurrentMonthDraftReport } from "@lib/reports/draftReport";

export const maxDuration = 60;

const PLAID_STALE_MS = 6 * 60 * 60 * 1000; // 6h

export async function POST(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;
  const { id: userId } = auth.user;

  // 1. Plaid backstop, gated per account.
  const accounts = await prisma.plaidAccount.findMany({
    where: { userId },
    select: { id: true, cursor: { select: { lastSyncAt: true } } },
  });

  let plaidSynced = 0;
  let plaidSkipped = 0;
  const now = Date.now();

  for (const acc of accounts) {
    const lastSyncAt = acc.cursor?.lastSyncAt?.getTime() ?? 0;
    const stale = now - lastSyncAt > PLAID_STALE_MS;
    if (!stale) {
      plaidSkipped++;
      continue;
    }
    try {
      const result = await syncTransactionsForAccount(acc.id);
      if (result.skipped) {
        plaidSkipped++;
      } else {
        plaidSynced++;
      }
    } catch (err) {
      console.error(
        `[mobile/sync-current-month] plaid sync failed account=${acc.id}:`,
        err
      );
    }
  }

  // 2. Categorize pass for this user.
  let categorized = 0;
  try {
    const result = await categorizeForUser(userId, { maxRows: 200 });
    categorized = result.updated;
  } catch (err) {
    console.error("[mobile/sync-current-month] categorize failed:", err);
  }

  // 3. Recompute draft.
  try {
    await upsertCurrentMonthDraftReport(userId);
  } catch (err) {
    console.error("[mobile/sync-current-month] draft recompute failed:", err);
  }

  // Skip threshold notifications: user is in the app; webhook + cron paths still send.

  return Response.json({
    success: true,
    response: { plaidSynced, plaidSkipped, categorized, recomputed: true },
  });
}
