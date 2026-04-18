import { plaidClient } from "@lib/plaid";
import prisma from "@lib/prisma/prismaClient";
import type { RemovedTransaction, Transaction } from "plaid";

const MUTATION_ERROR = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";

type SyncResult = {
  added: number;
  modified: number;
  removed: number;
  cursor: string;
};

const mapTransaction = (
  t: Transaction,
  userId: string,
  plaidAccountId: number
) => ({
  userId,
  plaidAccountId,
  transaction_id: t.transaction_id,
  account_id: t.account_id,
  name: t.name ?? "",
  amount: t.amount,
  date: t.date,
  category: t.category ?? [],
  original_description: t.original_description ?? null,
  merchant_name: t.merchant_name ?? null,
});

export const syncTransactionsForAccount = async (
  plaidAccountId: number
): Promise<SyncResult> => {
  const account = await prisma.plaidAccount.findUnique({
    where: { id: plaidAccountId },
    include: { cursor: true },
  });

  if (!account) {
    throw new Error(`PlaidAccount ${plaidAccountId} not found`);
  }

  const startingCursor = account.cursor?.cursor ?? "";

  let added: Transaction[] = [];
  let modified: Transaction[] = [];
  let removed: RemovedTransaction[] = [];
  let nextCursor = startingCursor;
  let hasMore = true;
  let attempts = 0;
  const MAX_ATTEMPTS = 3;

  pagination: while (hasMore) {
    try {
      const response = await plaidClient.transactionsSync({
        access_token: account.accessToken,
        cursor: nextCursor || undefined,
        count: 500,
        options: { include_original_description: true },
      });

      const data = response.data;
      added = added.concat(data.added);
      modified = modified.concat(data.modified);
      removed = removed.concat(data.removed);
      hasMore = data.has_more;
      nextCursor = data.next_cursor;
    } catch (error: unknown) {
      const code = (error as { response?: { data?: { error_code?: string } } })
        ?.response?.data?.error_code;

      if (code === MUTATION_ERROR && attempts < MAX_ATTEMPTS) {
        attempts += 1;
        added = [];
        modified = [];
        removed = [];
        nextCursor = startingCursor;
        hasMore = true;
        continue pagination;
      }
      throw error;
    }
  }

  const upserts = [...added, ...modified].map((t) => {
    const data = mapTransaction(t, account.userId, account.id);
    return prisma.syncedTransaction.upsert({
      where: {
        transaction_id_plaidAccountId: {
          transaction_id: t.transaction_id,
          plaidAccountId: account.id,
        },
      },
      create: data,
      update: data,
    });
  });

  const removeIds = removed
    .map((r) => r.transaction_id)
    .filter((id): id is string => Boolean(id));

  const deleteOp = removeIds.length
    ? [
        prisma.syncedTransaction.deleteMany({
          where: {
            plaidAccountId: account.id,
            transaction_id: { in: removeIds },
          },
        }),
      ]
    : [];

  const cursorOp = prisma.plaidCursor.upsert({
    where: { plaidAccountId: account.id },
    create: {
      plaidAccountId: account.id,
      cursor: nextCursor,
    },
    update: {
      cursor: nextCursor,
      lastSyncAt: new Date(),
    },
  });

  await prisma.$transaction([...upserts, ...deleteOp, cursorOp]);

  return {
    added: added.length,
    modified: modified.length,
    removed: removeIds.length,
    cursor: nextCursor,
  };
};
