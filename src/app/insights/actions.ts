"use server";

import { getServerSession } from "next-auth";
import { options } from "../api/auth/[...nextauth]/options";
import prisma from "@lib/prisma/prismaClient";
import { Transaction } from "@prisma/client";

interface DateRange {
  start: string;
  end: string;
}

export const getTransactionsByDateRange = async ({
  start,
  end,
}: DateRange): Promise<{
  success: boolean;
  data?: Array<Transaction>;
  error?: string;
}> => {
  try {
    // Get the current user session
    const session = await getServerSession(options);

    if (!session?.user?.email) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email,
      },
    });

    if (!user) {
      return {
        success: false,
        error: "User not found",
      };
    }

    // Fetch transactions within the date range for the logged user
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        date: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        date: "desc",
      },
      include: {
        report: {
          select: {
            reportName: true,
            reportType: true,
          },
        },
      },
    });

    return {
      success: true,
      data: transactions,
    };
  } catch (error) {
    console.error("Error fetching transactions by date range:", error);
    return {
      success: false,
      error: "Failed to fetch transactions",
    };
  }
};

export const getAvailableYears = async (): Promise<{
  success: boolean;
  data?: number;
  error?: string;
}> => {
  try {
    // Get the current user session
    const session = await getServerSession(options);

    if (!session?.user?.email) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email,
      },
    });

    if (!user) {
      return {
        success: false,
        error: "User not found",
      };
    }

    // Get the earliest transaction date for the user
    const earliestTransaction = await prisma.transaction.findFirst({
      where: {
        userId: user.id,
      },
      orderBy: {
        date: "asc",
      },
      select: {
        date: true,
      },
    });

    if (!earliestTransaction) {
      return {
        success: true,
        data: new Date().getFullYear(), // Return current year if no transactions
      };
    }

    // Extract the year from the earliest transaction date
    const earliestYear = new Date(earliestTransaction.date).getFullYear();

    return {
      success: true,
      data: earliestYear,
    };
  } catch (error) {
    console.error("Error fetching earliest year:", error);
    return {
      success: false,
      error: "Failed to fetch earliest year",
    };
  }
};
