"use server";

import { getServerSession } from "next-auth";
import { options } from "../api/auth/[...nextauth]/options";
import prisma from "@lib/prisma/prismaClient";
import { Transaction, ReportType } from "@generated/prisma/browser";

interface DateRange {
  start: string;
  end: string;
}

interface ReportParams {
  reportId: string;
  reportType: ReportType;
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

export const getTransactionsByReportId = async ({
  reportId,
  reportType,
}: ReportParams): Promise<{
  success: boolean;
  data?: Array<Transaction>;
  reportName?: string;
  error?: string;
}> => {
  try {
    const session = await getServerSession(options);

    if (!session?.user?.email) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

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

    // For ANNUAL reports, fetch transactions from child reports
    if (reportType === ReportType.ANNUAL) {
      const report = await prisma.report.findUnique({
        where: {
          id: reportId,
          userId: user.id,
        },
        select: {
          reportName: true,
          childReports: {
            select: {
              transactions: true,
            },
          },
        },
      });

      if (!report) {
        return {
          success: false,
          error: "Report not found",
        };
      }

      // Flatten transactions from all child reports
      const transactions = report.childReports.flatMap(
        (childReport) => childReport.transactions
      );

      return {
        success: true,
        data: transactions.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
        reportName: report.reportName,
      };
    }

    // For MONTHLY reports, fetch transactions directly
    const report = await prisma.report.findUnique({
      where: {
        id: reportId,
        userId: user.id,
      },
      select: {
        reportName: true,
        transactions: true,
      },
    });

    if (!report) {
      return {
        success: false,
        error: "Report not found",
      };
    }

    return {
      success: true,
      data: report.transactions.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
      reportName: report.reportName,
    };
  } catch (error) {
    console.error("Error fetching transactions by report ID:", error);
    return {
      success: false,
      error: "Failed to fetch transactions",
    };
  }
};
