import { plaidClient } from '@lib/plaid';
import prisma from '@lib/prisma/prismaClient';
import { Transaction } from 'plaid';
import { formatPlaidTransactions, mapDefaultCategoryToCustomCategory, mapPlaidCategoryToDefaultCategory } from 'utils/functions';

/**
 * Maps a Plaid transaction category to the final custom category
 * @param transaction - Formatted Plaid transaction with category and description
 * @returns The final mapped category string
 */
function mapTransactionCategory(transaction: {
  category?: string[];
  original_description?: string | null;
  name?: string;
}): string {
  const category = transaction.category ? transaction.category[0].replace('and', '&') : 'Others';
  const mappedCategory = mapPlaidCategoryToDefaultCategory(category);
  const description = transaction.original_description || transaction.name || '';
  return mapDefaultCategoryToCustomCategory(description, mappedCategory);
}

export type SyncResponse = {
  added: Transaction[];
  modified: Transaction[];
  removed: { transaction_id: string }[];
  nextCursor: string;
  hasMore: boolean;
};

export type SyncResult = {
  success: boolean;
  error?: any;
  addedCount?: number;
  modifiedCount?: number;
  removedCount?: number;
  nextCursor?: string;
};

/**
 * Sync transactions for a Plaid account using the transactions/sync endpoint
 * @param accessToken - Plaid access token for the account
 * @param plaidAccountId - Database ID of the PlaidAccount
 * @param cursor - Optional cursor from previous sync (null for initial sync)
 * @returns SyncResponse with added, modified, removed transactions and next cursor
 */
export async function syncTransactionsForAccount(
  accessToken: string,
  plaidAccountId: number,
  cursor: string | null = null
): Promise<SyncResponse> {
  console.log(`--------Syncing transactions for account ${plaidAccountId}--------`);
  
  const allAdded: Transaction[] = [];
  const allModified: Transaction[] = [];
  const allRemoved: { transaction_id: string }[] = [];
  let currentCursor = cursor;
  let hasMore = true;

  // Handle pagination - Plaid may return has_more: true requiring multiple calls
  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor: currentCursor || undefined,
      options: {
        include_original_description: true,
      },
    });

    const { added, modified, removed, next_cursor, has_more } = response.data;

    allAdded.push(...(added || []));
    allModified.push(...(modified || []));
    // Plaid returns removed as array of objects with transaction_id
    if (removed && Array.isArray(removed)) {
      allRemoved.push(...removed);
    }
    
    currentCursor = next_cursor || null;
    hasMore = has_more || false;
  }

  console.log(`--------Sync complete: ${allAdded.length} added, ${allModified.length} modified, ${allRemoved.length} removed--------`);

  return {
    added: allAdded,
    modified: allModified,
    removed: allRemoved,
    nextCursor: currentCursor || '',
    hasMore: false,
  };
}

/**
 * Process synced transactions and update the database
 * @param plaidAccountId - Database ID of the PlaidAccount
 * @param userId - User ID
 * @param syncResponse - Response from syncTransactionsForAccount
 * @returns SyncResult with counts of processed transactions
 */
export async function processSyncedTransactions(
  plaidAccountId: number,
  userId: string,
  syncResponse: SyncResponse
): Promise<SyncResult> {
  try {
    // Format transactions using existing formatting logic
    const formattedAdded = formatPlaidTransactions(syncResponse.added, false);
    const formattedModified = formatPlaidTransactions(syncResponse.modified, false);

    // Use a transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Insert new transactions
      if (formattedAdded.length > 0) {
        await tx.syncedTransaction.createMany({
          data: formattedAdded.map((transaction) => {
            const finalCategory = mapTransactionCategory(transaction);

            return {
              userId,
              plaidAccountId,
              transaction_id: transaction.transaction_id,
              account_id: transaction.account_id,
              name: transaction.name || transaction.original_description || 'No name',
              amount: transaction.amount,
              date: transaction.date,
              category: [finalCategory],
              original_description: transaction.original_description || null,
              merchant_name: transaction.merchant_name || null,
              notes: null,
            };
          }),
          skipDuplicates: true, // Skip if transaction_id + plaidAccountId already exists
        });
      }

      // Update modified transactions in parallel for better performance
      if (formattedModified.length > 0) {
        await Promise.all(
          formattedModified.map((transaction) => {
            const finalCategory = mapTransactionCategory(transaction);

            return tx.syncedTransaction.updateMany({
              where: {
                transaction_id: transaction.transaction_id,
                plaidAccountId,
              },
              data: {
                account_id: transaction.account_id,
                name: transaction.name || transaction.original_description || 'No name',
                amount: transaction.amount,
                date: transaction.date,
                category: [finalCategory],
                original_description: transaction.original_description || null,
                merchant_name: transaction.merchant_name || null,
                updatedAt: new Date(),
              },
            });
          })
        );
      }

      // Remove deleted transactions
      if (syncResponse.removed.length > 0) {
        await tx.syncedTransaction.deleteMany({
          where: {
            plaidAccountId,
            transaction_id: {
              in: syncResponse.removed.map((r) => r.transaction_id),
            },
          },
        });
      }

      // Update or create cursor
      if (syncResponse.nextCursor) {
        await tx.plaidCursor.upsert({
          where: {
            plaidAccountId,
          },
          create: {
            plaidAccountId,
            cursor: syncResponse.nextCursor,
            lastSyncAt: new Date(),
          },
          update: {
            cursor: syncResponse.nextCursor,
            lastSyncAt: new Date(),
          },
        });
      }
    });

    return {
      success: true,
      addedCount: formattedAdded.length,
      modifiedCount: formattedModified.length,
      removedCount: syncResponse.removed.length,
      nextCursor: syncResponse.nextCursor,
    };
  } catch (error) {
    console.error('Error processing synced transactions:', error);
    return {
      success: false,
      error,
    };
  }
}

/**
 * Perform initial sync for a newly connected account
 * Fetches all historical transactions and stores them with a cursor
 * @param accessToken - Plaid access token for the account
 * @param plaidAccountId - Database ID of the PlaidAccount
 * @param userId - User ID
 * @returns SyncResult indicating success or failure
 */
export async function initialSyncForAccount(
  accessToken: string,
  plaidAccountId: number,
  userId: string
): Promise<SyncResult> {
  console.log(`--------Starting initial sync for account ${plaidAccountId}--------`);
  
  try {
    // Start with null cursor for initial sync
    const syncResponse = await syncTransactionsForAccount(accessToken, plaidAccountId, null);
    
    // Process the synced transactions
    const result = await processSyncedTransactions(plaidAccountId, userId, syncResponse);
    
    if (result.success) {
      console.log(`--------Initial sync complete for account ${plaidAccountId}--------`);
    } else {
      console.error(`--------Initial sync failed for account ${plaidAccountId}--------`);
    }
    
    return result;
  } catch (error: any) {
    console.error('Error in initial sync:', error);
    const errorCode = error?.response?.data?.error_code;
    
    if (errorCode === 'ITEM_LOGIN_REQUIRED') {
      console.error('Item login required for account', plaidAccountId);
    }
    
    return {
      success: false,
      error,
    };
  }
}

/**
 * Perform incremental sync for an existing account using stored cursor
 * @param accessToken - Plaid access token for the account
 * @param plaidAccountId - Database ID of the PlaidAccount
 * @param userId - User ID
 * @returns SyncResult indicating success or failure
 */
export async function incrementalSyncForAccount(
  accessToken: string,
  plaidAccountId: number,
  userId: string
): Promise<SyncResult> {
  console.log(`--------Starting incremental sync for account ${plaidAccountId}--------`);
  
  try {
    // Get stored cursor
    const cursorRecord = await prisma.plaidCursor.findUnique({
      where: {
        plaidAccountId,
      },
    });

    const cursor = cursorRecord?.cursor || null;
    
    // Sync with cursor
    const syncResponse = await syncTransactionsForAccount(accessToken, plaidAccountId, cursor);
    
    // Process the synced transactions
    const result = await processSyncedTransactions(plaidAccountId, userId, syncResponse);
    
    if (result.success) {
      console.log(`--------Incremental sync complete for account ${plaidAccountId}--------`);
    } else {
      console.error(`--------Incremental sync failed for account ${plaidAccountId}--------`);
    }
    
    return result;
  } catch (error: any) {
    console.error('Error in incremental sync:', error);
    const errorCode = error?.response?.data?.error_code;
    
    if (errorCode === 'ITEM_LOGIN_REQUIRED') {
      console.error('Item login required for account', plaidAccountId);
    }
    
    return {
      success: false,
      error,
    };
  }
}

