import { options } from "@api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@lib/prisma/prismaClient";

export async function GET(req: Request) {
  const session = await getServerSession(options);

  if (!session || !session.user || !session.user.email) {
    return NextResponse.json({ success: false, error: "Session not found" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const plaidAccountId = searchParams.get("plaidAccountId");

  if (!startDate || !endDate) {
    return NextResponse.json({ success: false, error: "Missing date parameters" }, { status: 400 });
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
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Build query conditions
    const where: Prisma.SyncedTransactionWhereInput = {
      userId: user.id,
      date: {
        gte: startDate,
        lte: endDate,
      },
    };

    // Optionally filter by plaidAccountId
    if (plaidAccountId) {
      const parsedId = parseInt(plaidAccountId, 10);
      if (isNaN(parsedId)) {
        return NextResponse.json({
          success: false,
          error: "Invalid plaidAccountId parameter. Must be a valid integer.",
        }, { status: 400 });
      }
      where.plaidAccountId = parsedId;
    }

    // Query synced transactions
    const syncedTransactions = await prisma.syncedTransaction.findMany({
      where,
      orderBy: {
        date: 'desc',
      },
    });

    // Format transactions to match the format from /api/plaid/getTransactions
    // Note: Transactions are already sorted by date DESC from the Prisma query
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

    return NextResponse.json({
      success: true,
      transactions: formattedTransactions,
    });
  } catch (error) {
    console.error("Error fetching synced transactions:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch synced transactions",
      },
      { status: 500 }
    );
  }
}

