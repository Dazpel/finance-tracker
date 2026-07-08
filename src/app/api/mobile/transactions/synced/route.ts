import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";
import {
  dedupePendingPosted,
  serializeFeedTransaction,
} from "./_utils/feed";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor"); // a SyncedTransaction id, or null
  const accountId = searchParams.get("accountId"); // a Plaid account_id, or null

  const rawLimit = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  try {
    const rawRows = await prisma.syncedTransaction.findMany({
      where: {
        userId: auth.user.id,
        userSoftDeleted: false,
        ...(accountId ? { account_id: accountId } : {}),
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: limit,
      skip: cursor ? 1 : 0,
      ...(cursor ? { cursor: { id: cursor } } : {}),
    });

    // Compute the cursor from the RAW page (before dedupe) so that removing a
    // superseded pending row never makes a full page look partial and stop
    // pagination early.
    const nextCursor =
      rawRows.length === limit ? rawRows[rawRows.length - 1].id : null;

    const transactions = dedupePendingPosted(rawRows).map(
      serializeFeedTransaction
    );

    return Response.json({
      success: true,
      response: { transactions, nextCursor },
    });
  } catch (error) {
    console.error("[/api/mobile/transactions/synced]", error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
