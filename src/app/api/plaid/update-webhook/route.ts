import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@api/auth/[...nextauth]/options';
import { plaidClient } from '@lib/plaid';
import prisma from '@lib/prisma/prismaClient';
import { initialSyncForAccount } from '@lib/plaid/syncTransactions';

/**
 * Update webhook URL for a Plaid Item
 * POST /api/plaid/update-webhook
 * 
 * Request body:
 * {
 *   "item_id": "string",      // Required: Plaid item_id
 *   "webhook_url": "string"    // Required: New webhook URL (or null to remove)
 * }
 * 
 * This endpoint uses Plaid's /item/webhook/update API to update the webhook URL
 * associated with a specific Item. The webhook URL can be set to a new URL or
 * set to null to remove the webhook.
 * 
 * After successfully updating the webhook URL, an initial sync is triggered
 * in the background to initialize the item. This is required because Plaid's
 * SYNC_UPDATES_AVAILABLE webhooks won't fire until /transactions/sync has
 * been called at least once for the Item.
 */
export async function POST(request: Request) {
  try {
    // Check authentication
    const session = await getServerSession(options);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { item_id, webhook_url } = await request.json();

    // Validate required parameters
    if (!item_id) {
      return NextResponse.json(
        { error: 'item_id is required' },
        { status: 400 }
      );
    }

    // Validate webhook_url format if provided (must be valid HTTPS URL or null)
    if (webhook_url !== null && webhook_url !== undefined) {
      if (typeof webhook_url !== 'string' || webhook_url.trim() === '') {
        return NextResponse.json(
          { error: 'webhook_url must be a valid URL string or null' },
          { status: 400 }
        );
      }

      // URL validation - must be valid HTTPS URL
      try {
        const url = new URL(webhook_url);
        if (url.protocol !== 'https:') {
          return NextResponse.json(
            { error: 'webhook_url must use HTTPS protocol' },
            { status: 400 }
          );
        }
      } catch (urlError) {
        return NextResponse.json(
          { error: 'webhook_url must be a valid URL' },
          { status: 400 }
        );
      }
    }

    // Verify the item_id belongs to the authenticated user and get user info
    const plaidAccount = await prisma.plaidAccount.findFirst({
      where: {
        itemId: item_id,
        user: {
          email: session.user.email,
        },
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
      return NextResponse.json(
        { error: 'PlaidAccount not found for this user' },
        { status: 404 }
      );
    }

    console.log('--------Updating Plaid Item Webhook--------');
    console.log('Item ID:', item_id);
    console.log('PlaidAccount ID:', plaidAccount.id);
    console.log('Institution:', plaidAccount.institutionName);
    console.log('New Webhook URL:', webhook_url || '(removing webhook)');

    // Call Plaid API to update webhook
    const response = await plaidClient.itemWebhookUpdate({
      access_token: plaidAccount.accessToken,
      webhook: webhook_url || null,
    });

    // Verify the response indicates success
    if (!response?.data?.item || !response?.data?.request_id) {
      console.error('Invalid response from Plaid webhook update:', response);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid response from Plaid API',
        },
        { status: 500 }
      );
    }

    console.log('Webhook updated successfully');
    console.log('Request ID:', response.data.request_id);
    console.log('Item ID from response:', response.data.item.item_id);

    // If webhook URL was set (not removed), trigger initial sync to initialize the item
    // This is required because SYNC_UPDATES_AVAILABLE webhooks won't fire until
    // /transactions/sync has been called at least once for the Item
    // Only trigger sync if webhook update was successful
    if (webhook_url && response.data.item) {
      console.log(`Triggering initial sync for account ${plaidAccount.id} to initialize webhook support`);
      
      // Run initial sync in the background (don't wait for it to complete)
      // This allows the user to get immediate feedback while sync happens async
      // Wrap in Promise.resolve().then() to ensure errors don't crash the request handler
      Promise.resolve()
        .then(() => initialSyncForAccount(
          plaidAccount.accessToken,
          plaidAccount.id,
          plaidAccount.user.id
        ))
        .then((syncResult) => {
          if (syncResult.success) {
            console.log(`Initial sync completed for account ${plaidAccount.id} after webhook update`);
            console.log(`Sync results: ${syncResult.addedCount || 0} added, ${syncResult.modifiedCount || 0} modified, ${syncResult.removedCount || 0} removed`);
          } else {
            console.error(`Initial sync failed for account ${plaidAccount.id} after webhook update:`, syncResult.error);
          }
        })
        .catch((error) => {
          console.error(`Error in initial sync for account ${plaidAccount.id} after webhook update:`, error);
        });
    }

    return NextResponse.json({
      success: true,
      message: webhook_url 
        ? 'Webhook URL updated successfully. Initial sync initiated in background.' 
        : 'Webhook removed successfully',
      request_id: response.data.request_id,
      item_id: response.data.item.item_id,
      webhook_url: response.data.item.webhook || null,
      sync_initiated: webhook_url ? true : false,
    });
  } catch (error: any) {
    console.error('Error updating webhook:', error);
    
    // Handle Plaid API errors
    const errorMessage = error?.response?.data?.error_message || error?.message || 'Unknown error';
    const errorCode = error?.response?.data?.error_code || 'UNKNOWN_ERROR';
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        error_code: errorCode,
      },
      { status: 500 }
    );
  }
}

