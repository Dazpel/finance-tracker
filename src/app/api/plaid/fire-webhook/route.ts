import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@api/auth/[...nextauth]/options';
import { plaidClient } from '@lib/plaid';
import prisma from '@lib/prisma/prismaClient';

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

    // Only allow in sandbox/development environment
    const plaidEnv = process.env.PLAID_ENV || 'sandbox';
    if (plaidEnv !== 'sandbox' && plaidEnv !== 'development') {
      return NextResponse.json(
        { error: 'This endpoint is only available in sandbox/development environment' },
        { status: 403 }
      );
    }

    const { item_id, webhook_code } = await request.json();

    if (!item_id) {
      return NextResponse.json(
        { error: 'item_id is required' },
        { status: 400 }
      );
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

    // Default webhook code to SYNC_UPDATES_AVAILABLE if not provided
    const webhookCode = webhook_code || 'SYNC_UPDATES_AVAILABLE';

    console.log('--------Firing Plaid Sandbox Webhook--------');
    console.log('Item ID:', item_id);
    console.log('Webhook Code:', webhookCode);
    console.log('PlaidAccount ID:', plaidAccount.id);

    // Call Plaid sandbox API to fire webhook
    // webhook_type is optional but recommended for clarity
    const response = await plaidClient.sandboxItemFireWebhook({
      access_token: plaidAccount.accessToken,
      webhook_type: 'TRANSACTIONS' as any,
      webhook_code: webhookCode as any,
    });

    console.log('Webhook fired successfully');
    console.log('Request ID:', response.data.request_id);

    return NextResponse.json({
      success: true,
      message: 'Webhook fired successfully',
      request_id: response.data.request_id,
      item_id,
      webhook_code: webhookCode,
    });
  } catch (error: any) {
    console.error('Error firing webhook:', error);
    
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

