import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@api/auth/[...nextauth]/options';
import { plaidClient } from '@lib/plaid';
import prisma from '@lib/prisma/prismaClient';
import { initialSyncForAccount, type SyncResult } from '@lib/plaid/syncTransactions';

export const maxDuration = 60; // Allow up to 60 seconds for initial sync operations

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
 * synchronously to initialize the item. This is required because Plaid's
 * SYNC_UPDATES_AVAILABLE webhooks won't fire until /transactions/sync has
 * been called at least once for the Item.
 * 
 * The sync is awaited to ensure it completes before the function terminates,
 * preventing race conditions in serverless environments where background
 * promises may be killed when the response is sent.
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
      // Trim whitespace before validation
      const trimmedUrl = typeof webhook_url === 'string' ? webhook_url.trim() : webhook_url;
      
      if (typeof trimmedUrl !== 'string' || trimmedUrl === '') {
        return NextResponse.json(
          { error: 'webhook_url must be a valid URL string or null' },
          { status: 400 }
        );
      }

      // URL validation - must be valid HTTPS URL
      try {
        const url = new URL(trimmedUrl);
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

    // Call Plaid API to update webhook (use trimmed URL if it was provided)
    const trimmedUrl = webhook_url && typeof webhook_url === 'string' ? webhook_url.trim() : webhook_url;
    const response = await plaidClient.itemWebhookUpdate({
      access_token: plaidAccount.accessToken,
      webhook: trimmedUrl || null,
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
    let syncResult = null;
    if (trimmedUrl && response.data.item) {
      console.log(`Triggering initial sync for account ${plaidAccount.id} to initialize webhook support`);
      
      // Await the sync to ensure it completes before the function terminates
      // This prevents race conditions in serverless environments where background
      // promises may be killed when the response is sent
      try {
        syncResult = await initialSyncForAccount(
          plaidAccount.accessToken,
          plaidAccount.id,
          plaidAccount.user.id
        );
        
        if (syncResult.success) {
          console.log(`Initial sync completed for account ${plaidAccount.id} after webhook update`);
          console.log(`Sync results: ${syncResult.addedCount || 0} added, ${syncResult.modifiedCount || 0} modified, ${syncResult.removedCount || 0} removed`);
        } else {
          console.error(`Initial sync failed for account ${plaidAccount.id} after webhook update:`, syncResult.error);
        }
      } catch (error) {
        console.error(`Error in initial sync for account ${plaidAccount.id} after webhook update:`, error);
        syncResult = {
          success: false,
          error,
        };
      }
    }

    return NextResponse.json({
      success: true,
      message: trimmedUrl 
        ? (syncResult?.success 
            ? `Webhook URL updated successfully. Initial sync completed: ${syncResult.addedCount || 0} added, ${syncResult.modifiedCount || 0} modified, ${syncResult.removedCount || 0} removed.`
            : 'Webhook URL updated successfully. Initial sync failed - see sync_error for details.')
        : 'Webhook removed successfully',
      request_id: response.data.request_id,
      item_id: response.data.item.item_id,
      webhook_url: response.data.item.webhook || null,
      sync_initiated: trimmedUrl ? true : false,
      sync_result: syncResult ? {
        success: syncResult.success,
        added_count: syncResult.addedCount || 0,
        modified_count: syncResult.modifiedCount || 0,
        removed_count: syncResult.removedCount || 0,
        next_cursor: syncResult.nextCursor || null,
        error: syncResult.error ? {
          code: (syncResult.error as { code?: string; message: string; type?: string }).code,
          message: (syncResult.error as { code?: string; message: string; type?: string }).message,
          type: (syncResult.error as { code?: string; message: string; type?: string }).type,
        } : undefined,
      } : null,
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

