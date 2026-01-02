import { plaidClient } from "@lib/plaid";
import { CountryCode, Products } from "plaid";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(options);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { updateMode, accessToken } = await request.json();

    const createTokenRequest: any = {
      user: { client_user_id: process.env.PLAID_CLIENT_ID as string },
      client_name: "Finance-tracker",
      language: "en",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
    }

    // Add webhook URL if configured
    const webhookUrl = process.env.PLAID_WEBHOOK_URL;
    if (webhookUrl) {
      createTokenRequest.webhook = webhookUrl;
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
      { error: "Failed to create connection link" },
      { status: 500 }
    );
  }
}
