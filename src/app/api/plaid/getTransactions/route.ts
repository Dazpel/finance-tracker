import { options } from "@api/auth/[...nextauth]/options";
import { plaidClient } from "@lib/plaid";
import { findOrCreateUser } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";
import { Transaction } from "plaid";

export async function GET(req: Request) {
  const session = await getServerSession(options);
  if (!session || !session.user || !session.user.email) {
    return Response.json({ success: false, error: "Session not found" });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return Response.json({ success: false, error: "Missing date parameters" });
  }

  const accounts = await findOrCreateUser(prisma, session.user.email);
  let transactions: Transaction[] = [];

  try {
    for (const account of accounts) {
      let offset = 0;
      let total_transactions = 0;
      do {
        const response = await plaidClient.transactionsGet({
          access_token: account.accessToken || "",
          start_date: startDate,
          end_date: endDate,
          options: { offset, include_original_description: true, count: 500 }
        });
        
        transactions.push(...response.data.transactions);
        total_transactions = response.data.total_transactions;
        offset = transactions.length;
      } while (transactions.length < total_transactions);
    }

    return Response.json({ success: true, transactions });
  } catch (error) {
    return Response.json({
      success: false,
      error: error,
    });
  }
}
