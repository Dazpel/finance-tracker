# Plaid Webhook Testing Guide

This guide explains how to test the Plaid webhook endpoint for transaction synchronization using Plaid's sandbox API.

## Overview

The webhook endpoint (`/api/plaid/webhook`) handles `SYNC_UPDATES_AVAILABLE` webhooks from Plaid and triggers incremental transaction synchronization. This guide focuses on testing webhooks using Plaid's sandbox API in a deployed environment.

## Prerequisites

1. **Deployed Application**: Your application must be deployed with a publicly accessible webhook URL
2. **Plaid Sandbox Account**: Access to Plaid's sandbox environment
3. **Environment Variables**: Configured with Plaid credentials and webhook URL

## Environment Configuration

### Required Environment Variables

Set the following environment variables in your deployed environment:

```bash
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_sandbox_secret
PLAID_ENV=sandbox
PLAID_WEBHOOK_URL=https://yourdomain.com/api/plaid/webhook
```

**Important**: The `PLAID_WEBHOOK_URL` must be a publicly accessible HTTPS URL. Plaid will send webhooks to this endpoint.

## Step-by-Step Testing Process

### Step 1: Configure Webhook URL

The webhook URL is automatically configured when creating a Link token if `PLAID_WEBHOOK_URL` is set. This happens in the `/api/plaid/createLink` endpoint.

### Step 2: Connect a Plaid Account

1. Navigate to the accounts page in your application
2. Click "Connect Bank Account" or similar button
3. Use Plaid's sandbox credentials to connect a test account
4. Complete the connection flow

### Step 3: Get the Item ID

After connecting an account, you need to retrieve the `item_id` associated with the connected account. The `item_id` is stored in the `PlaidAccount` table in the database.

**Option A: Query the Database**

```sql
SELECT id, "itemId", "institutionName" 
FROM "PlaidAccount" 
WHERE "userId" = 'your-user-id';
```

**Option B: Check Server Logs**

When an account is connected, the `item_id` is logged in the server logs during the initial sync process.

**Option C: Add to API Response (Future Enhancement)**

You could modify the accounts API to include `item_id` in the response for easier access.

### Step 4: Trigger Webhook via API

Use the `/api/plaid/fire-webhook` endpoint to trigger a webhook from Plaid's sandbox API.

**Endpoint**: `POST /api/plaid/fire-webhook`

**Authentication**: Requires authenticated session (NextAuth)

**Request Body**:
```json
{
  "item_id": "your-item-id-here",
  "webhook_code": "SYNC_UPDATES_AVAILABLE"  // Optional, defaults to SYNC_UPDATES_AVAILABLE
}
```

**Example using cURL**:
```bash
curl -X POST https://yourdomain.com/api/plaid/fire-webhook \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "item_id": "your-item-id-here"
  }'
```

**Example using JavaScript/Fetch**:
```javascript
const response = await fetch('/api/plaid/fire-webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Include session cookie
  body: JSON.stringify({
    item_id: 'your-item-id-here',
    webhook_code: 'SYNC_UPDATES_AVAILABLE'
  })
});

const result = await response.json();
console.log(result);
```

**Success Response**:
```json
{
  "success": true,
  "message": "Webhook fired successfully",
  "request_id": "plaid-request-id",
  "item_id": "your-item-id",
  "webhook_code": "SYNC_UPDATES_AVAILABLE"
}
```

### Step 5: Monitor Webhook Reception

After triggering the webhook, Plaid will send a webhook to your configured webhook URL. Monitor your server logs to see:

1. **Webhook Reception**: Look for "--------Plaid Webhook Received--------"
2. **Payload Structure**: Full webhook payload is logged as JSON
3. **Account Lookup**: Verification that PlaidAccount is found
4. **Sync Execution**: "Triggering incremental sync" message
5. **Transaction Counts**: Before and after sync transaction counts
6. **Sync Results**: Added, modified, and removed transaction counts

**Example Log Output**:
```
--------Plaid Webhook Received--------
Request Headers: {...}
X-Plaid-Signature: v1,1234567890,hash...
--------Webhook Payload--------
{
  "webhook_type": "TRANSACTIONS",
  "webhook_code": "SYNC_UPDATES_AVAILABLE",
  "item_id": "your-item-id",
  "new_transactions": 5
}
Found PlaidAccount: ID=1, Institution=Test Bank, UserID=user-id
Transaction count before sync: 10
--------Triggering incremental sync for account 1--------
Transaction count after sync: 15
--------Sync Results--------
Added: 5
Modified: 0
Removed: 0
Next Cursor: cursor-value
```

### Step 6: Verify Transaction Data

After the webhook is processed, verify that transactions were synced correctly:

1. **Check Database**: Query the `SyncedTransaction` table to see new transactions
2. **Check Logs**: Review sync results in server logs
3. **Check UI**: View synced transactions in the application UI

**Database Query**:
```sql
SELECT COUNT(*) 
FROM "SyncedTransaction" 
WHERE "plaidAccountId" = your-account-id;
```

## Webhook Codes

The sandbox API supports different webhook codes for testing:

- **`SYNC_UPDATES_AVAILABLE`** (Default): Indicates new transaction updates are available
- **`DEFAULT_UPDATE`**: Alternative webhook code that may be sent by sandbox

**Note**: The current implementation handles `SYNC_UPDATES_AVAILABLE`. If you receive `DEFAULT_UPDATE`, you may need to handle it similarly or update the webhook handler.

## Troubleshooting

### Webhook Not Received

**Issue**: After firing webhook, no webhook is received at your endpoint.

**Solutions**:
1. Verify `PLAID_WEBHOOK_URL` is set correctly and publicly accessible
2. Check that the webhook URL was included when creating the Link token
3. Verify your webhook endpoint is accessible (test with a simple GET request)
4. Check firewall/security settings that might block Plaid's requests
5. Verify the webhook URL uses HTTPS (required by Plaid)

### Item ID Not Found

**Issue**: Error "PlaidAccount not found for item_id"

**Solutions**:
1. Verify the `item_id` is correct (check database)
2. Ensure the account was connected successfully
3. Check that the `item_id` belongs to the authenticated user
4. Verify the account wasn't deleted or removed

### Sync Fails

**Issue**: Webhook received but sync fails

**Solutions**:
1. Check server logs for detailed error messages
2. Verify the access token is still valid (not expired)
3. Check for `ITEM_LOGIN_REQUIRED` error (account needs re-authentication)
4. Verify database connection and permissions
5. Check Plaid API status and rate limits

### Authentication Errors

**Issue**: "Unauthorized" when calling fire-webhook endpoint

**Solutions**:
1. Ensure you're authenticated (have a valid session)
2. Check that the session cookie is included in the request
3. Verify NextAuth configuration is correct

### Environment Restriction

**Issue**: "This endpoint is only available in sandbox/development environment"

**Solutions**:
1. Ensure `PLAID_ENV` is set to `sandbox` or `development`
2. This endpoint is intentionally restricted for security (only works in non-production)

## Testing Different Scenarios

### Test New Transactions

1. Fire webhook with `SYNC_UPDATES_AVAILABLE`
2. Verify new transactions are added to database
3. Check transaction counts increase

### Test Modified Transactions

1. Use Plaid sandbox to simulate transaction modifications
2. Fire webhook
3. Verify modified transactions are updated in database

### Test Removed Transactions

1. Use Plaid sandbox to simulate transaction removals
2. Fire webhook
3. Verify removed transactions are deleted from database

## Security Considerations

1. **Webhook Signature Verification**: Full HMAC-SHA256 signature verification is implemented with timing-safe comparison to prevent timing attacks. The implementation follows [Plaid's webhook verification documentation](https://plaid.com/docs/webhooks/webhook-verification/).

2. **Endpoint Security**: The fire-webhook endpoint:
   - Requires authentication (NextAuth session)
   - Only works in sandbox/development environment
   - Verifies item_id belongs to authenticated user

3. **Webhook URL**: Must be HTTPS in production. Plaid will not send webhooks to HTTP endpoints in production.

## Additional Resources

- [Plaid Webhooks Documentation](https://plaid.com/docs/webhooks/)
- [Plaid Sandbox Documentation](https://plaid.com/docs/sandbox/)
- [Plaid Transactions Sync](https://plaid.com/docs/transactions/webhooks/)
- [Plaid Webhook Verification](https://plaid.com/docs/webhooks/webhook-verification/)

## Next Steps

After successful testing:

1. Implement full webhook signature verification for production
2. Add monitoring/alerting for webhook failures
3. Consider handling additional webhook codes (`DEFAULT_UPDATE`, etc.)
4. Add retry logic for failed syncs
5. Set up webhook endpoint monitoring

