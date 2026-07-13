import React from "react";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import prisma from "@lib/prisma/prismaClient";
import { getHomeSummary } from "./data";
import { getFirstName } from "./helpers";
import { HomeGreeting } from "./HomeGreeting";
import { ActionItems } from "./ActionItems";
import { MonthGlance } from "./MonthGlance";
import { JumpBackIn } from "./JumpBackIn";
import { EmptyState } from "./EmptyState";

export const Content = async () => {
  const session = await getServerSession(options);

  if (!session?.user?.email) {
    return <p className="text-danger">Please sign in to view your dashboard.</p>;
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return <p className="text-danger">User not found.</p>;
  }

  const summary = await getHomeSummary(user.id);
  const firstName = getFirstName(session.user.name);

  // First-run: no linked accounts yet — show the connect CTA, never a dead grid.
  if (summary.accountCount === 0) {
    return <EmptyState firstName={firstName} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <HomeGreeting firstName={firstName} />
      <ActionItems
        pendingReports={summary.pendingReports}
        exceededBudgets={summary.exceededBudgets}
      />
      <MonthGlance month={summary.month} />
      <JumpBackIn />
    </div>
  );
};
