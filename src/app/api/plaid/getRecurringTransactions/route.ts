import { options } from "@api/auth/[...nextauth]/options";
import { plaidClient } from "@lib/plaid";
import { plaidAccount } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import { TransactionStream } from "plaid";
import { formatPlaidTransactions, refreshUserTransactions } from "utils/functions";

export async function GET(req: Request) {
  const session = await getServerSession(options);
  const accounts: plaidAccount[] = session?.user?.accounts || [];
  let inflows: TransactionStream[] = [];
  let outflows: TransactionStream[] = [];

  if (!session || !session.user || !session.user.email) {
    return Response.json({ success: false, error: "Session not found" });
  }

  try {
    await refreshUserTransactions(accounts, session.user.email);
    await Promise.all(
      accounts.map(async (account) => {
        const response = await plaidClient.transactionsRecurringGet({
          access_token: account.accessToken || "",
        });

        inflows.push(...response.data.inflow_streams);
        outflows.push(...response.data.outflow_streams);
      })
    );

    const formattedOutflows = formatPlaidTransactions(outflows, true);
    const formattedInflows = formatPlaidTransactions(inflows, true);

    return Response.json({ success: true, outflows: formattedOutflows, inflows: formattedInflows });
  } catch (error) {
    console.log(error);
    
    return Response.json({
      success: false,
      error: error,
    });
  }
}
