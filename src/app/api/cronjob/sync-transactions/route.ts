import { NextResponse } from 'next/server';
import prisma from '@lib/prisma/prismaClient';
import { incrementalSyncForAccount } from '@lib/plaid/syncTransactions';

export const maxDuration = 60; // 1 minute for processing multiple accounts

export async function POST(request: Request) {
  const initTimer = Date.now();
  
  try {
    // Verify authorization
    if (
      request.headers.get('Authorization') !==
      `Bearer ${process.env.CRON_SECRET}`
    ) {
      return Response.json(
        { message: 'Invalid authorization header' },
        { status: 401 }
      );
    }

    console.log('-----------------------------------');
    console.log('------- Starting transaction sync cron job -------');
    console.log('-----------------------------------');

    // Find all active PlaidAccount records
    const accounts = await prisma.plaidAccount.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (accounts.length === 0) {
      console.log('No accounts found to sync');
      return NextResponse.json({
        message: 'No accounts to sync',
      });
    }

    console.log(`Found ${accounts.length} account(s) to sync`);

    let successCount = 0;
    let errorCount = 0;

    const BATCH_SIZE = 5;

    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batch = accounts.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (account) => {
          console.log(`Syncing account ${account.id} (${account.institutionName})`);
          try {
            const syncResult = await incrementalSyncForAccount(
              account.accessToken,
              account.id,
              account.user.id
            );
            return { account, syncResult };
          } catch (error) {
            return { account, error };
          }
        })
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          errorCount++;
          console.error('Error syncing account:', result.reason);
          continue;
        }

        const { account, syncResult, error } = result.value as {
          account: (typeof accounts)[0];
          syncResult?: Awaited<ReturnType<typeof incrementalSyncForAccount>>;
          error?: unknown;
        };

        if (error !== undefined) {
          errorCount++;
          console.error(`Error syncing account ${account.id}:`, error);
          continue;
        }

        if (!syncResult) {
          errorCount++;
          console.error(`Account ${account.id}: missing sync result`);
          continue;
        }

        if (syncResult.success) {
          successCount++;
          console.log(
            `Account ${account.id} synced: ${syncResult.addedCount} added, ` +
            `${syncResult.modifiedCount} modified, ${syncResult.removedCount} removed`
          );
        } else {
          errorCount++;
          const errorCode = syncResult.error?.code;
          const errorMessage = syncResult.error?.message || 'Unknown error';
          const errorType = syncResult.error?.type || 'Unknown';

          console.error(`Account ${account.id} sync failed:`, {
            errorCode,
            errorMessage,
            errorType,
          });

          switch (errorCode) {
            case 'ITEM_LOGIN_REQUIRED':
              console.error(`Account ${account.id} (${account.institutionName}) requires re-authentication`);
              break;
            case 'INVALID_ACCESS_TOKEN':
              console.error(`Account ${account.id} (${account.institutionName}) has invalid access token`);
              break;
            case 'ITEM_NOT_FOUND':
              console.error(`Account ${account.id} (${account.institutionName}) item not found in Plaid`);
              break;
            case 'RATE_LIMIT_EXCEEDED':
              console.error(`Account ${account.id} sync rate limited - will retry on next cron run`);
              break;
            case 'INSTITUTION_DOWN':
              console.error(`Account ${account.id} (${account.institutionName}) institution is temporarily unavailable`);
              break;
            default:
              console.error(`Account ${account.id} sync failed with error code: ${errorCode || 'UNKNOWN'}`);
          }
        }
      }
    }

    console.log('-----------------------------------');
    console.log(`Sync complete: ${successCount} succeeded, ${errorCount} failed`);
    console.log('-----------------------------------');

    return NextResponse.json({
      message: 'Sync completed',
      successCount,
      errorCount,
      totalAccounts: accounts.length,
    });
  } catch (error) {
    console.error('Error in sync-transactions cron job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    console.log(`Time taken: ${Date.now() - initTimer}ms`);
  }
}

