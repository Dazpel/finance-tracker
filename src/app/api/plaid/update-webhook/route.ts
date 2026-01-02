import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@api/auth/[...nextauth]/options';
import { plaidClient } from '@lib/plaid';
import prisma from '@lib/prisma/prismaClient';

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

    // Verify the item_id belongs to the authenticated user
    const plaidAccount = await prisma.plaidAccount.findFirst({
      where: {
        itemId: item_id,
        user: {
          email: session.user.email,
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

    console.log('Webhook updated successfully');
    console.log('Request ID:', response.data.request_id);
    console.log('Item ID from response:', response.data.item.item_id);

    return NextResponse.json({
      success: true,
      message: webhook_url ? 'Webhook URL updated successfully' : 'Webhook removed successfully',
      request_id: response.data.request_id,
      item_id: response.data.item.item_id,
      webhook_url: response.data.item.webhook || null,
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

