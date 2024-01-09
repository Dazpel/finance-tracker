import { ReportData } from "@components/ReportCard/ReportCard";
import { PrismaClient } from "@prisma/client";
import { TransactionBase } from "plaid";
import { formatReportKeys, formatTransactions } from "utils/functions";

export type PrismaResponse = {
  success: boolean;
  data?: any;
  error?: any;
};

export const findOrCreateUser = async (
  prisma: PrismaClient,
  userEmail: string
): Promise<string | null> => {
  // First, try to find the user by email
  let user = await prisma.user.findUnique({
    where: {
      email: userEmail,
    },
    select: {
      plaidAccessToken: true,
    },
  });

  // If the user doesn't exist, create a new one
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: userEmail,
      },
    });
  }

  return user.plaidAccessToken;
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
    const formattedReport = formatReportKeys(report);
    const formattedTransactions = formatTransactions(transactions);

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
    const formattedReport = formatReportKeys(report);
    const formattedTransactions = formatTransactions(transactions);

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
