import React, { Suspense } from "react";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import prisma from "@lib/prisma/prismaClient";
import { getAccountsData } from "./getAccountsData";
import AccountsPage from "./AccountsPage";
import PageLoader from "@components/PageLoader/PageLoader";

async function AccountsLoader() {
  const session = await getServerSession(options);

  if (!session?.user?.email) {
    return <p className="text-danger">Please sign in to view accounts.</p>;
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return <p className="text-danger">User not found.</p>;
  }

  const accountsData = await getAccountsData(user.id);

  return <AccountsPage initialData={accountsData} />;
}

export default function Page() {
  return (
    <div className="h-full">
      <h3 className="text-xl font-semibold mb-4">Current connected accounts</h3>
      <Suspense fallback={<PageLoader />}>
        <AccountsLoader />
      </Suspense>
    </div>
  );
}
