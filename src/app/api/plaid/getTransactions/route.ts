import { options } from "@api/auth/[...nextauth]/options";
import { plaidAccount } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import { sortTransactionsByDateDesc } from "utils/functions";
import {
  fetchUserTransactions,
  refreshUserTransactions,
} from "utils/serverTransactions";

export async function GET(req: Request) {
  const session = await getServerSession(options);
  const accounts: plaidAccount[] = session?.user?.accounts || [];

  if (!session || !session.user || !session.user.email) {
    return Response.json({ success: false, error: "Session not found" });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return Response.json({ success: false, error: "Missing date parameters" });
  }

  await refreshUserTransactions(accounts);
  const { success, transactions } = await fetchUserTransactions(
    startDate,
    endDate,
    accounts,
  );

  if (!success) {
    return Response.json({
      success: false,
      error: "Failed to fetch transactions",
    });
  }

  const sortedTransactions = sortTransactionsByDateDesc(transactions);

  return Response.json({ success: true, transactions: sortedTransactions });
}
