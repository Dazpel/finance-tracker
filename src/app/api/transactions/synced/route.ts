import { options } from "@api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";

export async function GET(req: Request) {
  const session = await getServerSession(options);

  if (!session || !session.user || !session.user.email) {
    return Response.json({ success: false, error: "Session not found" });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const plaidAccountId = searchParams.get("plaidAccountId");

  if (!startDate || !endDate) {
    return Response.json({ success: false, error: "Missing date parameters" });
  }

  try {
    // Get user to verify ownership
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      return Response.json({ success: false, error: "User not found" });
    }

    // Build query conditions
    const where: any = {
      userId: user.id,
      date: {
        gte: startDate,
        lte: endDate,
      },
    };

    // Optionally filter by plaidAccountId
    if (plaidAccountId) {
      where.plaidAccountId = parseInt(plaidAccountId, 10);
    }

    // Query synced transactions
    const syncedTransactions = await prisma.syncedTransaction.findMany({
      where,
      orderBy: {
        date: 'desc',
      },
    });

    // Format transactions to match the format from /api/plaid/getTransactions
    const formattedTransactions = syncedTransactions.map((transaction) => ({
      transaction_id: transaction.transaction_id,
      account_id: transaction.account_id,
      name: transaction.name,
      amount: transaction.amount,
      date: transaction.date,
      category: transaction.category,
      original_description: transaction.original_description,
      merchant_name: transaction.merchant_name,
      notes: transaction.notes,
    }));

    // Sort by date descending (most recent first)
    formattedTransactions.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return Response.json({ 
      success: true, 
      transactions: formattedTransactions 
    });
  } catch (error) {
    console.error("Error fetching synced transactions:", error);
    return Response.json({
      success: false,
      error: error,
    });
  }
}

