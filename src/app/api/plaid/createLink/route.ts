import { plaidClient } from "@lib/plaid";
import prisma from "@lib/prisma/prismaClient";
import { CountryCode, Products } from "plaid";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(options);

    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { updateMode, plaidAccountId } = await request.json();

    let accessToken: string | undefined;

    if (updateMode) {
      if (!plaidAccountId) {
        return NextResponse.json(
          { success: false, error: "plaidAccountId is required" },
          { status: 400 }
        );
      }

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });

      if (!user) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }

      // The userId filter is mandatory — one user must never reconnect another user's item.
      const account = await prisma.plaidAccount.findFirst({
        where: { id: plaidAccountId, userId: user.id },
        select: { accessToken: true },
      });

      if (!account) {
        return NextResponse.json(
          { success: false, error: "Connection not found" },
          { status: 404 }
        );
      }

      accessToken = account.accessToken;
    }

    const createTokenRequest = {
      user: { client_user_id: process.env.PLAID_CLIENT_ID as string },
      client_name: "Finance-tracker",
      language: "en",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      ...(process.env.PLAID_WEBHOOK_URL
        ? { webhook: process.env.PLAID_WEBHOOK_URL }
        : {}),
    }

    const requestVariables = updateMode
      ? { ...createTokenRequest, access_token: accessToken }
      : createTokenRequest;

    const tokenResponse = await plaidClient.linkTokenCreate(requestVariables);

    return NextResponse.json({
      link_token: tokenResponse.data.link_token,
      expires_at: tokenResponse.data.expiration
    });
  } catch (error) {
    console.error("Plaid link token creation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create connection link" },
      { status: 500 }
    );
  }
}
