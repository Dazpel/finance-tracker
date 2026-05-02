import { after, NextResponse } from "next/server";
import prisma from "@lib/prisma/prismaClient";
import { verifyPlaidWebhook } from "@lib/plaid/verifyWebhook";
import { syncTransactionsForAccount } from "@lib/plaid/syncTransactions";
import { checkThresholdsAndNotify } from "@lib/notifications/thresholdCheck";

type WebhookBody = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
};

const SYNC_CODES = new Set([
  "SYNC_UPDATES_AVAILABLE",
  "INITIAL_UPDATE",
  "HISTORICAL_UPDATE",
  "DEFAULT_UPDATE",
]);

export async function POST(request: Request) {
  const rawBody = await request.text();

  const ok = await verifyPlaidWebhook(rawBody, request.headers);
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { webhook_type, webhook_code, item_id } = body;

  if (webhook_type === "TRANSACTIONS" && webhook_code && SYNC_CODES.has(webhook_code)) {
    if (!item_id) {
      console.warn("Plaid webhook missing item_id", body);
      return NextResponse.json({ received: true });
    }

    const account = await prisma.plaidAccount.findUnique({
      where: { itemId: item_id },
      select: { id: true, userId: true },
    });

    if (!account) {
      console.warn(`Plaid webhook for unknown item_id: ${item_id}`);
      return NextResponse.json({ received: true });
    }

    const { id: accountId, userId } = account;
    after(async () => {
      try {
        const result = await syncTransactionsForAccount(accountId);
        if (result.skipped) {
          console.log(
            `Plaid sync [${webhook_code}] account=${accountId} skipped (lock held)`
          );
        } else {
          console.log(
            `Plaid sync [${webhook_code}] account=${accountId} pages=${result.pages} +${result.added} ~${result.modified} -${result.removed}`
          );
        }
      } catch (error) {
        console.error(
          `Plaid sync failed for account=${accountId} code=${webhook_code}:`,
          error
        );
        return;
      }
      // Run AFTER the sync (which already called upsertCurrentMonthDraftReport).
      // Lives here, not inside draftReport.ts, so the notifications module
      // never enters draftReport's import graph — keeps the email SDK and
      // React Email components out of the client bundle (utils/functions.ts →
      // NextAuth options → prismaFunctions → draftReport is reachable from
      // client components).
      try {
        await checkThresholdsAndNotify(userId, new Date());
      } catch (err) {
        console.error(
          `[plaid-webhook] threshold check failed for user=${userId}:`,
          err
        );
      }
    });
  } else {
    console.log(`Plaid webhook [${webhook_type}/${webhook_code}] item=${item_id}`);
  }

  return NextResponse.json({ received: true });
}
