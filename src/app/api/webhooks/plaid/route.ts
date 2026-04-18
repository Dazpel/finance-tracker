import { NextResponse } from "next/server";
import prisma from "@lib/prisma/prismaClient";
import { verifyPlaidWebhook } from "@lib/plaid/verifyWebhook";
import { syncTransactionsForAccount } from "@lib/plaid/syncTransactions";

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
      select: { id: true },
    });

    if (!account) {
      console.warn(`Plaid webhook for unknown item_id: ${item_id}`);
      return NextResponse.json({ received: true });
    }

    try {
      const result = await syncTransactionsForAccount(account.id);
      console.log(
        `Plaid sync [${webhook_code}] account=${account.id} pages=${result.pages} +${result.added} ~${result.modified} -${result.removed}`
      );
    } catch (error) {
      console.error(
        `Plaid sync failed for account=${account.id} code=${webhook_code}:`,
        error
      );
    }
  } else {
    console.log(`Plaid webhook [${webhook_type}/${webhook_code}] item=${item_id}`);
  }

  return NextResponse.json({ received: true });
}
