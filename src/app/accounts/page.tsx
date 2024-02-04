import React from "react";
import prisma from "@lib/prisma/prismaClient";
import { getServerSession } from "next-auth";
import { plaidClient } from "@lib/plaid";
import AccountsPage, { AccountsPageProps } from "./AccountsPage";
import { options } from "@api/auth/[...nextauth]/options";
import { findOrCreateUser } from "@lib/prisma/prismaFunctions";

async function getAccounts(): Promise<AccountsPageProps> {
  const session = await getServerSession(options);

  let response: AccountsPageProps = {
    accounts: [],
    success: false,
  };

  try {
    const accounts = await findOrCreateUser(prisma, session.user.email);

    if (accounts.length === 0) return { ...response, success: true };

    const accountPromises = accounts.map(async account => {
      const res = await plaidClient.accountsGet({
        access_token: account.accessToken,
      });
      return {
        institutionName: account.institutionName,
        accounts: res.data.accounts,
      };
    });

    response.accounts = await Promise.all(accountPromises);

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
