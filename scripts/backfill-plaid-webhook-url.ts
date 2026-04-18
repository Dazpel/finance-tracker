/**
 * One-shot script: register PLAID_WEBHOOK_URL on every existing PlaidAccount.
 *
 * Only updates Items belonging to the currently configured PLAID_ENV
 * (sandbox/development/production) — access tokens from other envs will
 * error and be logged but not halt the script.
 *
 * Usage:
 *   pnpm dlx tsx --env-file=.env scripts/backfill-plaid-webhook-url.ts
 */
import { plaidClient } from "../src/lib/plaid";
import prisma from "../src/lib/prisma/prismaClient";

const main = async () => {
  const webhook = process.env.PLAID_WEBHOOK_URL;
  if (!webhook) {
    console.error("PLAID_WEBHOOK_URL is not set.");
    process.exit(1);
  }

  const accounts = await prisma.plaidAccount.findMany({
    select: { id: true, institutionName: true, accessToken: true, itemId: true },
  });

  console.log(`Updating webhook URL on ${accounts.length} PlaidAccount(s) → ${webhook}`);

  let ok = 0;
  let fail = 0;

  for (const account of accounts) {
    try {
      await plaidClient.itemWebhookUpdate({
        access_token: account.accessToken,
        webhook,
      });
      console.log(`  ✓ [${account.id}] ${account.institutionName} (${account.itemId})`);
      ok += 1;
    } catch (error: unknown) {
      const data = (error as { response?: { data?: unknown } })?.response?.data;
      console.warn(
        `  ✗ [${account.id}] ${account.institutionName} (${account.itemId}) —`,
        data ?? error
      );
      fail += 1;
    }
  }

  console.log(`\nDone. ok=${ok} fail=${fail}`);
  await prisma.$disconnect();
};

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
