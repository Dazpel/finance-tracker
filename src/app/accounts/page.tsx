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
    const accessToken = await findOrCreateUser(prisma, session.user.email);

    if (accessToken) {
      const res = await plaidClient.accountsGet({
        access_token: accessToken,
      });
      const accounts = res.data.accounts;
      response.success = true;
      response.accounts = accounts;
    }

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
