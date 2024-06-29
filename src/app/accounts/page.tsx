import React from "react";
import { getServerSession } from "next-auth";
import { plaidClient } from "@lib/plaid";
import AccountsPage, { AccountsPageProps, ConnectionType } from "./AccountsPage";
import { options } from "@api/auth/[...nextauth]/options";
import { plaidAccount } from "@lib/prisma/prismaFunctions";

const formatConnections = (connections: plaidAccount[]): ConnectionType[] => {
  return connections.map((connection) => {
    return {
      accessToken: connection.accessToken,
      institutionName: connection.institutionName,
    };
  });
}

async function getAccounts(): Promise<AccountsPageProps> {
  const session = await getServerSession(options);
  const accounts: plaidAccount[] = session?.user?.accounts || [];

  let response: AccountsPageProps = {
    accounts: [],
    success: false,
    connections: [],
    accountsWithErrors: [],
  };

  try {
  if (accounts.length === 0) return { ...response, success: true };
    
    const accountPromises = accounts.map(async account => {
      const res = await plaidClient.accountsGet({
        access_token: account.accessToken,
        
      }).catch((error) => {
        response.accountsWithErrors?.push({
          institutionName: account.institutionName,
          accessToken: account.accessToken,
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
    response.success = true;
  } catch (error) {
    console.log(error);
    response.success = false;
  }

  return response;
}

export default async function Page() {
  const res = await getAccounts();
  return <AccountsPage {...res} />;
}
