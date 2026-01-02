import { NextResponse } from 'next/server';
import prisma from '@lib/prisma/prismaClient';
import { incrementalSyncForAccount } from '@lib/plaid/syncTransactions';
import crypto from 'crypto';

export const maxDuration = 60; // Webhooks may take time to process

/**
 * Verify Plaid webhook signature
 * @param body - Raw request body
 * @param signature - Signature from X-Plaid-Signature header
 * @returns boolean indicating if signature is valid
 */
function verifyWebhookSignature(body: string, signature: string): boolean {
  const PLAID_SECRET = process.env.PLAID_SECRET;
  
  if (!PLAID_SECRET) {
    console.error('PLAID_SECRET not configured');
    return false;
  }

  try {
    // Plaid webhook signature format: version,timestamp,body_hash
    // For now, we'll verify the signature exists
    // In production, you should verify the full signature according to Plaid's documentation
    // https://plaid.com/docs/webhooks/webhook-verification/
    if (!signature || signature.length === 0) {
      return false;
    }

    // For development, we can skip full verification
    // In production, implement full signature verification per Plaid docs
    // This is a simplified check - implement full verification for production
    return true;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('X-Plaid-Signature') || '';

    // Log request headers for debugging
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    console.log('--------Plaid Webhook Received--------');
    console.log('Request Headers:', JSON.stringify(headers, null, 2));
    console.log('X-Plaid-Signature:', signature);

    // Verify webhook signature
    if (!verifyWebhookSignature(body, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const webhookData = JSON.parse(body);
    const { webhook_type, webhook_code, item_id, new_transactions, removed_transactions } = webhookData;

    // Log full webhook payload structure
    console.log('--------Webhook Payload--------');
    console.log(JSON.stringify(webhookData, null, 2));
    console.log('Webhook Type:', webhook_type);
    console.log('Webhook Code:', webhook_code);
    console.log('Item ID:', item_id);
    if (new_transactions !== undefined) {
      console.log('New Transactions Count:', new_transactions);
    }
    if (removed_transactions !== undefined) {
      console.log('Removed Transactions Count:', removed_transactions);
    }

    // Handle SYNC_UPDATES_AVAILABLE webhook
    if (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      // Find the PlaidAccount by itemId
      const plaidAccount = await prisma.plaidAccount.findFirst({
        where: {
          itemId: item_id,
        },
        include: {
          user: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!plaidAccount) {
        console.error(`PlaidAccount not found for item_id: ${item_id}`);
        return NextResponse.json(
          { error: 'Account not found' },
          { status: 404 }
        );
      }

      console.log(`Found PlaidAccount: ID=${plaidAccount.id}, Institution=${plaidAccount.institutionName}, UserID=${plaidAccount.user.id}`);

      // Get transaction count before sync for comparison
      const transactionCountBefore = await prisma.syncedTransaction.count({
        where: { plaidAccountId: plaidAccount.id },
      });
      console.log(`Transaction count before sync: ${transactionCountBefore}`);

      // Trigger incremental sync for this account
      console.log(`--------Triggering incremental sync for account ${plaidAccount.id}--------`);
      const syncResult = await incrementalSyncForAccount(
        plaidAccount.accessToken,
        plaidAccount.id,
        plaidAccount.user.id
      );

      if (syncResult.success) {
        // Get transaction count after sync
        const transactionCountAfter = await prisma.syncedTransaction.count({
          where: { plaidAccountId: plaidAccount.id },
        });
        console.log(`Transaction count after sync: ${transactionCountAfter}`);
        console.log(`--------Sync Results--------`);
        console.log(`Added: ${syncResult.addedCount || 0}`);
        console.log(`Modified: ${syncResult.modifiedCount || 0}`);
        console.log(`Removed: ${syncResult.removedCount || 0}`);
        console.log(`Next Cursor: ${syncResult.nextCursor || 'N/A'}`);
        
        return NextResponse.json({ 
          success: true,
          message: 'Sync completed',
          addedCount: syncResult.addedCount,
          modifiedCount: syncResult.modifiedCount,
          removedCount: syncResult.removedCount,
        });
      } else {
        console.error('--------Sync Failed--------');
        console.error('Error:', JSON.stringify(syncResult.error, null, 2));
        return NextResponse.json(
          { error: 'Sync failed', details: syncResult.error },
          { status: 500 }
        );
      }
    }

    // Handle other webhook types/codes if needed
    // For now, just acknowledge receipt
    console.log('Webhook acknowledged but not processed');
    return NextResponse.json({ 
      success: true,
      message: 'Webhook received',
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error },
      { status: 500 }
    );
  }
}

