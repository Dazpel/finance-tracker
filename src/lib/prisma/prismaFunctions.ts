import { ReportData } from "@components/ReportCard/ReportCard";
import { PrismaClient } from "@prisma/client";
import { TransactionBase } from "plaid";
import { formatReportKeys, formatTransactions } from "utils/functions";

export type PrismaResponse = {
  success: boolean;
  data?: any;
  error?: any;
};

export type plaidAccount = {
  id: number;
  userId: string;
  institutionName: string;
  accessToken: string;
  itemId: string;
  createdAt: Date;
  updatedAt: Date;
};

export const findOrCreateUser = async (
  prisma: PrismaClient,
  userEmail: string
): Promise<plaidAccount[]> => {
  // First, try to find the user by email
  let user = await prisma.user.findUnique({
    where: {
      email: userEmail,
    },
    select: {
      accounts: true,
    },
  });

  // If the user doesn't exist, create a new one
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: userEmail,
      },
      select: {
        accounts: true,
      },
    });
  }

  return user.accounts;
};

export const getReports = async (prisma: PrismaClient, userEmail: string) => {
  let response: PrismaResponse = {
    success: false,
  };

  try {
    const reports = await prisma.report.findMany({
      where: {
        user: {
          email: userEmail,
        },
      },
    });

    response = {
      success: true,
      data: reports,
    };
  } catch (error) {
    response = {
      success: false,
      error,
    };
  }

  return response;
};

export const getTransactions = async (
  prisma: PrismaClient,
  userEmail: string,
  reportId: string
) => {
  let response: PrismaResponse = {
    success: false,
  };

  try {
    const transactions = await prisma.report.findUnique({
      where: {
        id: Number(reportId),
        AND: {
          user: {
            email: userEmail,
          },
        },
      },
      select: {
        transactions: true,
      },
    });

    response = {
      success: true,
      data: transactions,
    };
  } catch (error) {
    response = {
      success: false,
      error,
    };
  }

  return response;
};

export const createReport = async (
  prisma: PrismaClient,
  transactions: TransactionBase[],
  report: ReportData,
  reportName: string,
  userEmail: string
): Promise<PrismaResponse> => {
  let response: PrismaResponse = {
    success: false,
  };

  try {
    const user = await prisma.user.findUnique({
      where: {
        email: userEmail,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      return (response = {
        success: false,
        error: "User not found",
      });
    }

    const formattedReport = formatReportKeys(report);
    const formattedTransactions = formatTransactions(transactions, user.id);

    await prisma.user.update({
      where: {
        email: userEmail,
      },
      data: {
        reports: {
          create: {
            reportName,
            ...formattedReport,
            transactions: {
              createMany: {
                data: formattedTransactions,
              },
            },
          },
        },
      },
    });

    response = {
      success: true,
    };
  } catch (error) {
    response = {
      success: false,
      error,
    };
  }

  return response;
};

export const deleteReport = async (
  prisma: PrismaClient,
  reportId: number,
  userEmail: string
): Promise<PrismaResponse> => {
  let response: PrismaResponse = {
    success: false,
  };

  try {
    await prisma.report.delete({
      where: {
        id: reportId,
        AND: {
          user: {
            email: userEmail,
          },
        },
      },
    });

    response = {
      success: true,
    };
  } catch (error) {
    response = {
      success: false,
      error,
    };
  }

  return response;
};

export const updateReport = async (
  prisma: PrismaClient,
  transactions: TransactionBase[],
  reportId: number,
  report: ReportData,
  reportName: string,
  userEmail: string
): Promise<PrismaResponse> => {
  let response: PrismaResponse = {
    success: false,
  };

  try {
    const user = await prisma.user.findUnique({
      where: {
        email: userEmail,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      return (response = {
        success: false,
        error: "User not found",
      });
    }

    const formattedReport = formatReportKeys(report);
    const formattedTransactions = formatTransactions(transactions, user.id);

    // Delete all transactions associated with the report
    await prisma.transaction.deleteMany({
      where: {
        reportId,
      },
    });

    // Update the report
    await prisma.report.update({
      where: {
        id: reportId,
        AND: {
          user: {
            email: userEmail,
          },
        },
      },
      data: {
        reportName,
        ...formattedReport,
        transactions: {
          createMany: {
            data: formattedTransactions,
          },
        },
      },
    });

    response = {
      success: true,
    };
  } catch (error) {
    console.log({ error });

    response = {
      success: false,
      error,
    };
  }

  return response;
};

export const mergeReports = async (
  prisma: PrismaClient,
  reportId_1: number,
  reportId_2: number,
  userEmail: string
): Promise<PrismaResponse> => {
  let response: PrismaResponse = {
    success: false,
  };

  try {
    const user = await prisma.user.findUnique({
      where: {
        email: userEmail,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      return (response = {
        success: false,
        error: "User not found",
      });
    }

    await prisma.$transaction(async (prisma) => {
      // Update the reportId for transactions
      await prisma.$executeRaw`
        UPDATE "Transaction"
        SET "reportId" = ${reportId_1}
        WHERE "reportId" = ${reportId_2}`;

      // Delete duplicate transactions, keeping the first instance for each transaction_id
      await prisma.$executeRaw`
        DELETE FROM "Transaction"
        WHERE "id" IN (
          SELECT "id"
          FROM (
            SELECT "id",
                  ROW_NUMBER() OVER (PARTITION BY "transaction_id" ORDER BY "id") AS row_number
            FROM "Transaction"
            WHERE "reportId" = ${reportId_1}
          ) duplicates
          WHERE duplicates.row_number > 1
        )`;
      
      await prisma.$executeRaw`
        WITH expense_aggregation AS (
          SELECT COALESCE(SUM(amount), 0) * -1 AS total_expenses 
          FROM "Transaction"
          WHERE "reportId" = ${reportId_1} AND "category" <> '{\"revenue\"}'
        ), revenue_aggregation AS (
          SELECT COALESCE(SUM(ABS(amount)), 0) AS total_revenue
          FROM "Transaction"
          WHERE "reportId" = ${reportId_1} AND "category" = '{\"revenue\"}'
        )
        UPDATE "Report"
        SET "expenses" = (SELECT total_expenses FROM expense_aggregation),
            "revenue" = (SELECT total_revenue FROM revenue_aggregation),
            "total" = (SELECT total_revenue FROM revenue_aggregation) - (SELECT total_expenses FROM expense_aggregation)
        WHERE "id" = ${reportId_1}`;

      // Delete the now-empty second report
      await prisma.$executeRaw`
        DELETE FROM "Report"
        WHERE "id" = ${reportId_2}`;
    });

    response = {
      success: true,
    };
  } catch (error) {
    console.log({ error });

    response = {
      success: false,
      error,
    };
  }

  return response;
};

export const isUserAuthorized = async (
  prisma: PrismaClient,
  userEmail: string
): Promise<PrismaResponse> => {
  let response: PrismaResponse = {
    success: false,
  };

  try {
    const user = await prisma.user.findUnique({
      where: {
        email: userEmail,
      },
      select: {
        authorized: true,
      },
    });

    if (!user) {
      return (response = {
        success: false,
        error: "User not found",
      });
    }

    response = {
      success: true,
      data: user.authorized,
    };
  } catch (error) {
    response = {
      success: false,
      error,
    };
  }

  return response;
};
