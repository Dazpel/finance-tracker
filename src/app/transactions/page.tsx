import React from "react";
import prisma from "@lib/prisma/prismaClient";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import { findOrCreateUser } from "@lib/prisma/prismaFunctions";
import TransactionsPage, { TransactionsPageProps } from "./TransactionsPage";

async function getAccessToken(): Promise<TransactionsPageProps> {
  const session = await getServerSession(options);
  let isAccessTokenValid = false;
  try {
    const accessToken = await findOrCreateUser(prisma, session.user.email);

    if (accessToken) isAccessTokenValid = true;
  } catch (error) {
    console.log(error);
  }

  return { isAccessTokenValid };
}

export default async function Page() {
  const res = await getAccessToken();
  return <TransactionsPage {...res} />;
}
