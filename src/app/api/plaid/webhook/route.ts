import { NextResponse } from 'next/server';
import prisma from '@lib/prisma/prismaClient';
import { incrementalSyncForAccount } from '@lib/plaid/syncTransactions';
import crypto from 'crypto';
import { jwtVerify, decodeProtectedHeader, importJWK } from 'jose';
import { plaidClient } from '@lib/plaid';

export const maxDuration = 60; // Webhooks may take time to process

/**
 * Verify Plaid webhook signature using JWT verification
 * @param body - Raw request body
 * @param verificationHeader - JWT token from Plaid-Verification header
 * @returns boolean indicating if signature is valid
 * 
 * Plaid webhook verification uses a JWT token in the Plaid-Verification header.
 * The JWT must be verified using a JWK fetched from Plaid's servers.
 * 
 * Implementation follows Plaid's official documentation:
 * 1. Decode JWT header and validate algorithm is ES256
 * 2. Fetch JWK using the kid from JWT header via webhookVerificationKeyGet
 * 3. Verify JWT signature using the JWK
 * 4. Validate iat (issued at) is not older than 5 minutes
 * 5. Compare request body SHA-256 hash using constant-time comparison
 * 
 * Reference: https://plaid.com/docs/api/webhooks/webhook-verification/
 */
async function verifyWebhookSignature(body: string, verificationHeader: string): Promise<boolean> {
  if (!verificationHeader || verificationHeader.length === 0) {
    console.error('Plaid-Verification header is missing');
    return false;
  }

  try {
    // Decode the JWT header to get the algorithm and key ID (kid)
    const header = decodeProtectedHeader(verificationHeader);
    
    // Ensure that the value of the alg (algorithm) field in the header is "ES256"
    // Reject the webhook if this is not the case (per Plaid documentation)
    if (header.alg !== 'ES256') {
      console.error(`Invalid algorithm in JWT header. Expected ES256, got ${header.alg}`);
      return false;
    }

    const kid = header.kid;
    if (!kid) {
      console.error('JWT header missing kid (key ID)');
      return false;
    }

    // Fetch the JWK from Plaid's webhook verification key endpoint
    const jwkResponse = await plaidClient.webhookVerificationKeyGet({
      key_id: kid,
    });

    if (!jwkResponse?.data?.key) {
      console.error('Failed to fetch JWK from Plaid');
      return false;
    }

    const jwk = jwkResponse.data.key;

    // Convert Plaid JWKPublicKey to standard JWK format for jose library
    // Plaid uses EC (Elliptic Curve) keys with x, y coordinates
    const jwkForJose = {
      kty: jwk.kty,
      use: jwk.use,
      kid: jwk.kid,
      alg: jwk.alg,
      x: jwk.x,
      y: jwk.y,
      crv: jwk.crv,
    };

    // Import the JWK for verification using jose library
    const publicKey = await importJWK(jwkForJose, jwk.alg);

    // Verify the JWT signature and validate iat (issued at) is not older than 5 minutes
    // The maxTokenAge option handles the iat validation automatically
    const { payload } = await jwtVerify(verificationHeader, publicKey, {
      algorithms: ['ES256'],
      maxTokenAge: '5 min',
    });

    // Verify the request_body_sha256 claim matches the SHA-256 hash of the body
    const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
    const expectedBodyHash = payload.request_body_sha256 as string;

    if (!expectedBodyHash) {
      console.error('JWT payload missing request_body_sha256 claim');
      return false;
    }

    // Use constant-time comparison to prevent timing attacks
    const bodyHashLower = bodyHash.toLowerCase();
    const expectedBodyHashLower = expectedBodyHash.toLowerCase();

    // Validate hash lengths (SHA-256 = 64 hex characters)
    if (bodyHashLower.length !== 64 || expectedBodyHashLower.length !== 64) {
      console.error('Invalid hash length');
      return false;
    }

    const bodyHashBuffer = Buffer.from(bodyHashLower, 'hex');
    const expectedBodyHashBuffer = Buffer.from(expectedBodyHashLower, 'hex');

    const hashMatches = crypto.timingSafeEqual(bodyHashBuffer, expectedBodyHashBuffer);
    if (!hashMatches) {
      console.error('Request body hash mismatch');
      return false;
    }

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
    const verificationHeader = request.headers.get('Plaid-Verification') || '';

    // Log request headers for debugging
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    console.log('--------Plaid Webhook Received--------');
    console.log('Plaid-Verification:', verificationHeader ? 'Present' : 'Missing');

    // Verify webhook signature using JWT verification per Plaid docs
    const isValid = await verifyWebhookSignature(body, verificationHeader);
    if (!isValid) {
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
          { error: 'Sync failed' },
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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

