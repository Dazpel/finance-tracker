import { plaidClient } from "@lib/plaid";
import { CountryCode, Products } from "plaid";
import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";

export async function POST(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;
  const { id: userId } = auth.user;

  let connectionId: string | undefined;
  try {
    const body = await request.json();
    connectionId = body?.connectionId;
  } catch {
    // No body (or invalid JSON) means "new connection" — connectionId stays undefined.
  }

  try {
    const baseRequest = {
      user: { client_user_id: process.env.PLAID_CLIENT_ID as string },
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
