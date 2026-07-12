import { plaidClient } from "@lib/plaid";
import prisma from "@lib/prisma/prismaClient";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";

type ItemStatus = {
  institutionName: string;
  itemId: string;
  plaidAccountId: string;
  linkedAt: string;
  lastLocalSyncAt: string | null;
  error: { code: string; message: string } | null;
  requestFailed: { code: string; message: string } | null;
  updateType: string | null;
  consentExpirationTime: string | null;
  lastSuccessfulUpdate: string | null;
  lastFailedUpdate: string | null;
  lastWebhook: { sentAt: string | null; code: string | null } | null;
};

export async function GET() {
  const session = await getServerSession(options);

  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const accounts = await prisma.plaidAccount.findMany({
      where: { userId: user.id },
      include: { cursor: { select: { lastSyncAt: true } } },
      orderBy: { createdAt: "asc" },
    });

    const items: ItemStatus[] = await Promise.all(
      accounts.map(async (account) => {
        const base = {
          institutionName: account.institutionName,
          itemId: account.itemId,
          plaidAccountId: account.id,
          linkedAt: account.createdAt.toISOString(),
          lastLocalSyncAt: account.cursor?.lastSyncAt?.toISOString() ?? null,
        };

        try {
          const response = await plaidClient.itemGet({
            access_token: account.accessToken,
          });
          const { item, status } = response.data;

          return {
            ...base,
            error: item.error
              ? {
                  code: item.error.error_code,
                  message: item.error.error_message,
                }
              : null,
            requestFailed: null,
            updateType: item.update_type ?? null,
            consentExpirationTime: item.consent_expiration_time ?? null,
            lastSuccessfulUpdate:
              status?.transactions?.last_successful_update ?? null,
            lastFailedUpdate: status?.transactions?.last_failed_update ?? null,
            lastWebhook: status?.last_webhook
              ? {
                  sentAt: status.last_webhook.sent_at ?? null,
                  code: status.last_webhook.code_sent ?? null,
                }
              : null,
          };
        } catch (error: unknown) {
          const data = (
            error as {
              response?: {
                data?: { error_code?: string; error_message?: string };
              };
            }
          )?.response?.data;

          return {
            ...base,
            error: null,
            requestFailed: {
              code: data?.error_code ?? "UNKNOWN",
              message: data?.error_message ?? "Request to Plaid failed",
            },
            updateType: null,
            consentExpirationTime: null,
            lastSuccessfulUpdate: null,
            lastFailedUpdate: null,
            lastWebhook: null,
          };
        }
      })
    );

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("Plaid item status error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch item status" },
      { status: 500 }
    );
  }
}
