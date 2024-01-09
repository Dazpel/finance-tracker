import { options } from "@api/auth/[...nextauth]/options";
import { plaidClient } from "@lib/plaid";
import { findOrCreateUser } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";

type TransactionsGetRequest = {
  access_token: string;
  start_date: string;
  end_date: string;
  options?: {
    count?: number;
    offset?: number;
  };
};

export async function GET(req: Request) {
  const session = await getServerSession(options);
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const accessToken = await findOrCreateUser(prisma, session.user.email);

  const request: TransactionsGetRequest = {
    access_token: accessToken || "",
    start_date: startDate as string,
    end_date: endDate as string,
  };

  try {
    const response = await plaidClient.transactionsGet(request);
    let transactions = response.data.transactions;
    const total_transactions = response.data.total_transactions;
    // Manipulate the offset parameter to paginate
    // transactions and retrieve all available data
    while (transactions.length < total_transactions) {
      const paginatedRequest: TransactionsGetRequest = {
        ...request,
        options: {
          offset: transactions.length,
        },
      };
      const paginatedResponse = await plaidClient.transactionsGet(
        paginatedRequest
      );
      transactions = transactions.concat(paginatedResponse.data.transactions);
    }
    return Response.json({ success: true, transactions });
  } catch (error) {
    return Response.json({
      success: false,
      error: error,
    });
  }
}
