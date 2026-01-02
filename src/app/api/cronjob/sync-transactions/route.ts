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
          console.error(`Account ${account.id} sync failed:`, syncResult.error);
          
          // Check if it's an ITEM_LOGIN_REQUIRED error
          const errorCode = syncResult.error?.response?.data?.error_code;
          if (errorCode === 'ITEM_LOGIN_REQUIRED') {
            console.error(`Account ${account.id} requires re-authentication`);
            // Could send email notification here
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
        details: error,
      },
      { status: 500 }
    );
  } finally {
    console.log(`Time taken: ${Date.now() - initTimer}ms`);
  }
}

