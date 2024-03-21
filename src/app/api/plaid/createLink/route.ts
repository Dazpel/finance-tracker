import { plaidClient } from "@lib/plaid";
import { CountryCode, Products } from "plaid";

export async function POST(request: Request) {
  const res = await request.json();
  const updateMode = res.updateMode;
  const accessToken = res.accessToken;

  const createTokenRequest = {
    user: { client_user_id: process.env.PLAID_CLIENT_ID as string },
    client_name: "Finance-tracker",
    language: "en",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    // redirect_uri: process.env.PLAID_SANDBOX_REDIRECT_URI,
  }

  const requestVariables = updateMode ? { ...createTokenRequest, access_token: accessToken } : createTokenRequest;

  const tokenResponse = await plaidClient.linkTokenCreate({...requestVariables});

  return Response.json(tokenResponse.data);
}
