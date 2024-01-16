import { plaidClient } from "@lib/plaid";
import { CountryCode, Products } from "plaid";

export async function POST() {
  const tokenResponse = await plaidClient.linkTokenCreate({
    user: { client_user_id: process.env.PLAID_CLIENT_ID as string },
    client_name: "Finance-tracker",
    language: "en",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    // redirect_uri: process.env.PLAID_SANDBOX_REDIRECT_URI,
  });

  return Response.json(tokenResponse.data);
}
