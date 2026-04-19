import { plaidClient } from "./client";
import prisma from "@lib/prisma/prismaClient";
import { Prisma, type PlaidAccount, type PlaidCursor } from "@prisma/client";
import type { RemovedTransaction, Transaction } from "plaid";

const MUTATION_ERROR = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";
const UPSERT_CHUNK_SIZE = 100;
const MAX_MUTATION_RETRIES = 3;
const PAGE_COUNT = 500;
// A sync can never legitimately run longer than this. Beyond it, we assume the
// previous holder crashed (e.g. Vercel function killed at the 60s cap) and reclaim.
const SYNC_LOCK_STALE_MS = 10 * 60 * 1000;

type SyncResult = {
  added: number;
  modified: number;
  removed: number;
  cursor: string;
  pages: number;
  skipped?: true;
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
  pending: t.pending ?? false,
  pending_transaction_id: t.pending_transaction_id ?? null,
});

const chunk = <T>(arr: T[], size: number): T[][] => {
  if (arr.length <= size) return arr.length ? [arr] : [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const tryAcquireLock = async (plaidAccountId: number): Promise<boolean> => {
  try {
    await prisma.plaidSyncLock.create({ data: { plaidAccountId } });
    return true;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }

  const existing = await prisma.plaidSyncLock.findUnique({
    where: { plaidAccountId },
  });
  if (!existing || Date.now() - existing.acquiredAt.getTime() < SYNC_LOCK_STALE_MS) {
    return false;
  }

  // Stale lock — previous holder likely crashed. Reclaim atomically: only the caller
  // whose deleteMany matches the old row wins; others fail the subsequent create.
  const { count } = await prisma.plaidSyncLock.deleteMany({
    where: { plaidAccountId, acquiredAt: existing.acquiredAt },
  });
  if (count === 0) return false;

  try {
    await prisma.plaidSyncLock.create({ data: { plaidAccountId } });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
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

  const acquired = await tryAcquireLock(plaidAccountId);
  if (!acquired) {
    return {
      added: 0,
      modified: 0,
      removed: 0,
      cursor: account.cursor?.cursor ?? "",
      pages: 0,
      skipped: true,
    };
  }

  try {
    return await runSync(account);
  } finally {
    await prisma.plaidSyncLock
      .delete({ where: { plaidAccountId } })
      .catch(() => {});
  }
};

type AccountWithCursor = PlaidAccount & { cursor: PlaidCursor | null };

const runSync = async (account: AccountWithCursor): Promise<SyncResult> => {
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

    // When a pending txn posts, Plaid sends `added` (new posted row, with pending_transaction_id)
    // and `removed` (old pending row). Carry over the user's note before the removed step deletes it.
    const pendingIds = added
      .map((t) => t.pending_transaction_id)
      .filter((id): id is string => Boolean(id));

    const priorPending = pendingIds.length
      ? await prisma.syncedTransaction.findMany({
          where: {
            plaidAccountId: account.id,
            transaction_id: { in: pendingIds },
            notes: { not: null },
          },
          select: { transaction_id: true, notes: true },
        })
      : [];
    const noteByPendingId = new Map(
      priorPending.map((p) => [p.transaction_id, p.notes])
    );

    // If the posted row already exists from a prior partial sync, the upsert hits
    // `update` (which omits notes). Migrate the pending note onto the existing row
    // here so it survives the subsequent `removed` delete of the pending row.
    if (noteByPendingId.size) {
      await Promise.all(
        added
          .filter(
            (t) =>
              t.pending_transaction_id &&
              noteByPendingId.has(t.pending_transaction_id)
          )
          .map((t) =>
            prisma.syncedTransaction.updateMany({
              where: {
                transaction_id: t.transaction_id,
                plaidAccountId: account.id,
                notes: null,
              },
              data: { notes: noteByPendingId.get(t.pending_transaction_id!)! },
            })
          )
      );
    }

    const upsertOps = [...added, ...modified].map((t) => {
      const data = mapTransaction(t, account.userId, account.id);
      const carriedNote = t.pending_transaction_id
        ? noteByPendingId.get(t.pending_transaction_id)
        : undefined;
      const createData = carriedNote ? { ...data, notes: carriedNote } : data;
      return prisma.syncedTransaction.upsert({
        where: {
          transaction_id_plaidAccountId: {
            transaction_id: t.transaction_id,
            plaidAccountId: account.id,
          },
        },
        create: createData,
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
