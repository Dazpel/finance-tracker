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
        status: 200,
        message: 'No accounts to sync',
      });
    }

    console.log(`Found ${accounts.length} account(s) to sync`);

    let successCount = 0;
    let errorCount = 0;

    // Sync each account
    for (const account of accounts) {
      try {
        console.log(`Syncing account ${account.id} (${account.institutionName})`);
        
        const syncResult = await incrementalSyncForAccount(
          account.accessToken,
          account.id,
          account.user.id
        );

        if (syncResult.success) {
          successCount++;
          console.log(
            `Account ${account.id} synced: ${syncResult.addedCount} added, ` +
            `${syncResult.modifiedCount} modified, ${syncResult.removedCount} removed`
          );
        } else {
          errorCount++;
          // syncResult.error is now sanitized with format: { code?: string; message: string; type?: string; }
          const errorCode = syncResult.error?.code;
          const errorMessage = syncResult.error?.message || 'Unknown error';
          const errorType = syncResult.error?.type || 'Unknown';
          
          console.error(`Account ${account.id} sync failed:`, {
            errorCode,
            errorMessage,
            errorType,
          });
          
          // Handle specific Plaid error codes
          switch (errorCode) {
            case 'ITEM_LOGIN_REQUIRED':
              console.error(`Account ${account.id} (${account.institutionName}) requires re-authentication`);
              // TODO: Send email notification to user about re-authentication requirement
              break;
            case 'INVALID_ACCESS_TOKEN':
              console.error(`Account ${account.id} (${account.institutionName}) has invalid access token`);
              // TODO: Mark account as invalid or trigger re-link flow
              break;
            case 'ITEM_NOT_FOUND':
              console.error(`Account ${account.id} (${account.institutionName}) item not found in Plaid`);
              // TODO: Mark account as deleted or trigger cleanup
              break;
            case 'RATE_LIMIT_EXCEEDED':
              console.error(`Account ${account.id} sync rate limited - will retry on next cron run`);
              // Rate limit is temporary, will retry automatically
              break;
            case 'INSTITUTION_DOWN':
              console.error(`Account ${account.id} (${account.institutionName}) institution is temporarily unavailable`);
              // Temporary issue, will retry automatically
              break;
            default:
              console.error(`Account ${account.id} sync failed with error code: ${errorCode || 'UNKNOWN'}`);
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`Error syncing account ${account.id}:`, error);
      }
    }

    console.log('-----------------------------------');
    console.log(`Sync complete: ${successCount} succeeded, ${errorCount} failed`);
    console.log('-----------------------------------');

    return NextResponse.json({
      status: 200,
      message: 'Sync completed',
      successCount,
      errorCount,
      totalAccounts: accounts.length,
    });
  } catch (error) {
    console.error('Error in sync-transactions cron job:', error);
    return NextResponse.json(
      { 
        status: 500,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  } finally {
    console.log(`Time taken: ${Date.now() - initTimer}ms`);
  }
}

