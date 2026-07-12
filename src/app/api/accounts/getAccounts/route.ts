import { options } from "@api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";
import { plaidAccount } from "@lib/prisma/prismaFunctions";
import { AccountsPageProps, ConnectionType } from "app/accounts/AccountsPage";
import { plaidClient } from "@lib/plaid";

const formatConnections = (connections: plaidAccount[]): ConnectionType[] => {
  return connections.map((connection) => {
    return {
      plaidAccountId: connection.id,
      institutionName: connection.institutionName,
    };
  });
};

export async function GET() {
  const session = await getServerSession(options);
  const accounts: plaidAccount[] = session?.user?.accounts || [];

  let response: AccountsPageProps = {
    accounts: [],
    connections: [],
    accountsWithErrors: [],
  };

  try {
    if (accounts.length === 0) {
      return Response.json({ response, success: true });
    }

    const accountPromises = accounts.map(async (account) => {
      const res = await plaidClient
        .accountsGet({
          access_token: account.accessToken,
        })
        .catch((error) => {
          response.accountsWithErrors?.push({
            institutionName: account.institutionName,
            plaidAccountId: account.id,
            error: error.response.data.error_code,
          });

          return { data: { accounts: [] } };
        });
      return {
        institutionName: account.institutionName,
        accounts: res.data.accounts,
      };
    });

    response.accounts = await Promise.all(accountPromises);
    response.connections = formatConnections(accounts);
    return Response.json({ success: true, response });
  } catch (error) {
    console.log(error);
    return Response.json({
      success: false,
      error,
      response,
    });
  }
}
