/**
 * Sandbox helper: fires SYNC_UPDATES_AVAILABLE for every PlaidAccount
 * in the DB via Plaid's /sandbox/item/fire_webhook endpoint.
 *
 * Usage:
 *   pnpm dlx tsx --env-file=.env scripts/fire-sync-webhook.ts
 */
import { plaidClient } from "../src/lib/plaid";
import prisma from "../src/lib/prisma/prismaClient";
import { SandboxItemFireWebhookRequestWebhookCodeEnum, WebhookType } from "plaid";

const main = async () => {
  const accounts = await prisma.plaidAccount.findMany({
    select: { id: true, institutionName: true, accessToken: true, itemId: true },
  });

  if (!accounts.length) {
    console.log("No PlaidAccounts found.");
    await prisma.$disconnect();
    return;
  }

  for (const account of accounts) {
    try {
      await plaidClient.sandboxItemFireWebhook({
        access_token: account.accessToken,
        webhook_type: WebhookType.Transactions,
        webhook_code: SandboxItemFireWebhookRequestWebhookCodeEnum.SyncUpdatesAvailable,
      });
      console.log(`  ✓ fired SYNC_UPDATES_AVAILABLE for [${account.id}] ${account.institutionName}`);
    } catch (error: unknown) {
      const data = (error as { response?: { data?: unknown } })?.response?.data;
      console.warn(`  ✗ [${account.id}] —`, data ?? error);
    }
  }

  await prisma.$disconnect();
};

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
