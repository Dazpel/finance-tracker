import { plaidClient } from "@lib/plaid";
import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";

export async function POST(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;
  const { id: userId } = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const publicToken: string = body.publicToken;
  const institutionName: string = body.institutionName;

  if (!publicToken || typeof publicToken !== 'string' || !institutionName || typeof institutionName !== 'string') {
    return Response.json(
      { success: false, error: "publicToken and institutionName are required" },
      { status: 400 }
    );
  }

  try {
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    if (!accessToken || !itemId) {
      return Response.json(
        { success: false, error: "Access token or Item Id not found" },
        { status: 502 }
      );
    }

    const account = await prisma.plaidAccount.upsert({
      where: { itemId },
      create: { institutionName, accessToken, itemId, userId },
      update: { institutionName, accessToken },
      select: { id: true, institutionName: true },
    });

    return Response.json({
      success: true,
      response: { id: account.id, institutionName: account.institutionName },
    });
  } catch (error) {
    console.error("[/api/mobile/plaid/exchange-public-token]", error);
    return Response.json(
      { success: false, error: "Failed to add account" },
      { status: 500 }
    );
  }
}
