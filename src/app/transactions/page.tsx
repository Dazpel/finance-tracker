import React from "react";
import prisma from "@lib/prisma/prismaClient";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import { findOrCreateUser } from "@lib/prisma/prismaFunctions";
import TransactionsPage, { TransactionsPageProps } from "./TransactionsPage";
import { plaidClient } from "@lib/plaid";
import { isDateBeforeToday } from "utils/functions";

async function getAccessToken(): Promise<TransactionsPageProps> {
  const session = await getServerSession(options);
  let isAccessTokenValid = false;
  try {
    const accounts = await findOrCreateUser(prisma, session.user.email);
    isAccessTokenValid = accounts?.length > 0;

    if (accounts && accounts.length > 0) {
      await Promise.all(
        accounts.map(async (account) => {
          const response = await plaidClient.itemGet({
            access_token: account.accessToken || "",
          });

          const lastSuccessfulUpdate = new Date(response.data.status?.transactions?.last_successful_update as string);

          if (isDateBeforeToday(lastSuccessfulUpdate)) {
            await plaidClient.transactionsRefresh({
              access_token: account.accessToken || "",
            });
          }
        })
      );
    }
  } catch (error) {
    console.log(error);
  }

  return { isAccessTokenValid };
}

export default async function Page() {
  const res = await getAccessToken();
  return <TransactionsPage {...res} />;
}
