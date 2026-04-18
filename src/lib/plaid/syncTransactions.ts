import { plaidClient } from "./client";
import prisma from "@lib/prisma/prismaClient";
import type { RemovedTransaction, Transaction } from "plaid";

const MUTATION_ERROR = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";
const UPSERT_CHUNK_SIZE = 100;
const MAX_MUTATION_RETRIES = 3;
const PAGE_COUNT = 500;

type SyncResult = {
  added: number;
  modified: number;
  removed: number;
  cursor: string;
  pages: number;
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

const chunk = <T>(arr: T[], size: number): T[][] => {
  if (arr.length <= size) return arr.length ? [arr] : [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

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
  let pageCursor = startingCursor;
  let hasMore = true;
  let mutationRetries = 0;
  let pages = 0;
  const totals = { added: 0, modified: 0, removed: 0 };

  while (hasMore) {
    let added: Transaction[];
    let modified: Transaction[];
    let removed: RemovedTransaction[];
    let nextCursor: string;

    try {
      const response = await plaidClient.transactionsSync({
        access_token: account.accessToken,
        cursor: pageCursor || undefined,
        count: PAGE_COUNT,
        options: { include_original_description: true },
      });
      added = response.data.added;
      modified = response.data.modified;
      removed = response.data.removed;
      nextCursor = response.data.next_cursor;
      hasMore = response.data.has_more;
    } catch (error: unknown) {
      const code = (error as { response?: { data?: { error_code?: string } } })
        ?.response?.data?.error_code;

      if (code === MUTATION_ERROR && mutationRetries < MAX_MUTATION_RETRIES) {
        mutationRetries += 1;
        pageCursor = startingCursor;
        hasMore = true;
        pages = 0;
        totals.added = 0;
        totals.modified = 0;
        totals.removed = 0;
        continue;
      }
      throw error;
    }

    const upsertOps = [...added, ...modified].map((t) => {
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

    for (const group of chunk(upsertOps, UPSERT_CHUNK_SIZE)) {
      await prisma.$transaction(group);
    }

    if (removeIds.length) {
      await prisma.syncedTransaction.deleteMany({
        where: {
          plaidAccountId: account.id,
          transaction_id: { in: removeIds },
        },
      });
    }

    await prisma.plaidCursor.upsert({
      where: { plaidAccountId: account.id },
      create: { plaidAccountId: account.id, cursor: nextCursor },
      update: { cursor: nextCursor, lastSyncAt: new Date() },
    });

    totals.added += added.length;
    totals.modified += modified.length;
    totals.removed += removeIds.length;
    pageCursor = nextCursor;
    pages += 1;
  }

  return { ...totals, cursor: pageCursor, pages };
};
