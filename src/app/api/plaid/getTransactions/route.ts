import { options } from "@api/auth/[...nextauth]/options";
import { plaidClient } from "@lib/plaid";
import { plaidAccount } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import { Transaction } from "plaid";
import { formatPlaidTransactions, sortTransactionsByDateDesc } from "utils/functions";
import { refreshUserTransactions } from "utils/serverTransactions";

export async function GET(req: Request) {
  const session = await getServerSession(options);
  const accounts: plaidAccount[] = session?.user?.accounts || [];
  let transactions: Transaction[] = [];

  if (!session || !session.user || !session.user.email) {
    return Response.json({ success: false, error: "Session not found" });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return Response.json({ success: false, error: "Missing date parameters" });
  }

  try {
    await refreshUserTransactions(accounts, session.user.email);
    await Promise.all(accounts.map(async (account) => {
      let offset = 0;
      let totalTransactions = 0;

      do {
        const response = await plaidClient.transactionsGet({
          access_token: account.accessToken || '',
          start_date: startDate,
          end_date: endDate,
          options: { offset, include_original_description: true, count: 500 },
        });

        transactions.push(...response.data.transactions);
        totalTransactions = response.data.total_transactions;
        offset = transactions.length;
      } while (transactions.length < totalTransactions);
    }));

    const formattedTransactions = formatPlaidTransactions(transactions, false);
    const sortedTransactions = sortTransactionsByDateDesc(formattedTransactions);

    return Response.json({ success: true, transactions: sortedTransactions });
  } catch (error) {
    console.error(error);
    return Response.json({
      success: false,
      error: error,
    });
  }
}
