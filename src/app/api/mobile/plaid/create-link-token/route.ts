import { plaidClient } from "@lib/plaid";
import { CountryCode, Products } from "plaid";
import { z } from "zod";
import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";

// connectionId is a PlaidAccount id (uuid). Optional: absent body = "new connection".
const BodySchema = z.object({
  connectionId: z.uuid().optional(),
});

export async function POST(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;
  const { id: userId } = auth.user;

  // An empty body is a valid "new connection" request; a present-but-malformed
  // body is a client bug we reject rather than silently treat as new-connection.
  const raw = await request.text();
  let connectionId: string | undefined;
  if (raw.trim().length > 0) {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return Response.json(
        { success: false, error: "Invalid JSON" },
        { status: 400 }
      );
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }
    connectionId = parsed.data.connectionId;
  }

  try {
    const baseRequest = {
      user: { client_user_id: userId },
      client_name: "MoneyEye",
      language: "en",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      android_package_name: "com.moneyeye.mobile",
      ...(process.env.PLAID_WEBHOOK_URL
        ? { webhook: process.env.PLAID_WEBHOOK_URL }
        : {}),
    };

    let requestVariables: any = baseRequest;

    if (connectionId) {
      const account = await prisma.plaidAccount.findFirst({
        where: { id: connectionId, userId },
        select: { accessToken: true },
      });
      if (!account) {
        return Response.json(
          { success: false, error: "Connection not found" },
          { status: 404 }
        );
      }
      requestVariables = { ...baseRequest, access_token: account.accessToken };
    }

    const tokenResponse = await plaidClient.linkTokenCreate(requestVariables);

    return Response.json({
      success: true,
      response: {
        linkToken: tokenResponse.data.link_token,
        expiration: tokenResponse.data.expiration,
      },
    });
  } catch (error) {
    console.error("[/api/mobile/plaid/create-link-token]", error);
    return Response.json(
      { success: false, error: "Failed to create connection link" },
      { status: 500 }
    );
  }
}
