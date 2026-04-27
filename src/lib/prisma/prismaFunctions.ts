import { ReportData } from "@components/ReportCard/ReportCard";
import { PrismaClient, ReportStatus, ReportType } from "@prisma/client";
import { RecurringReportData } from "app/recurring-transactions/_utils/constants";
import { computeReportTotals, resolveCategory } from "@lib/reports/draftReport";
import { LOCAL_ACCOUNT_ID } from "utils/constants";
import { formatReportKeys, formatTransactions } from "utils/functions";
import { ReportDataDTO, TransactionWithNotes } from "utils/types";

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

export const getReports = async (prisma: PrismaClient, userEmail: string, recurring?: boolean) => {
  let response: PrismaResponse = {
    success: false,
  };

  let reports = [];

  try {

    if (recurring) {
      reports = await prisma.recurringReport.findMany({
        where: {
          user: {
            email: userEmail,
          },
        },
      });
    } else {
      reports = await prisma.report.findMany({
        where: {
          user: {
            email: userEmail,
          },
        },
      });
    }

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

export const getRecurringTransactions = async (
  prisma: PrismaClient,
  userEmail: string,
  reportId: string
) => {
  let response: PrismaResponse = {
    success: false,
  };

  try {
    const transactions = await prisma.recurringReport.findUnique({
      where: {
        id: Number(reportId),
        AND: {
          user: {
            email: userEmail,
          },
        },
      },
      select: {
        inflowTransactions: true,
        outflowTransactions: true,
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

export const getTransactions = async (
  prisma: PrismaClient,
  userEmail: string,
  reportType: ReportType,
  reportId: string
) => {
  let response: PrismaResponse = {
    success: false,
  };

  let transactions;

  try {
    if (reportType === ReportType.ANNUAL) {
      transactions = await prisma.report.findUnique({
        where: {
          id: Number(reportId),
          AND: {
            user: {
              email: userEmail,
            },
          },
        },
        select: {
          childReports: {
            select: {
              transactions: true,
            },
          },
        },
      });
    } else {
      const report = await prisma.report.findUnique({
        where: {
          id: Number(reportId),
          AND: {
            user: {
              email: userEmail,
            },
          },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          month: true,
          year: true,
          transactions: true,
        },
      });

      // Pending monthly reports have no committed Transaction snapshot yet —
      // pull from SyncedTransaction by month/year and shape rows to match.
      const isPending =
        report &&
        (report.status === ReportStatus.DRAFT ||
          report.status === ReportStatus.PENDING_APPROVAL) &&
        report.month != null &&
        report.year != null;

      if (isPending) {
        const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
        const start = `${report.year}-${pad2(report.month!)}-01`;
        const nextMonthStart = new Date(
          Date.UTC(report.year!, report.month!, 1)
        );
        const end =
          `${nextMonthStart.getUTCFullYear()}-` +
          `${pad2(nextMonthStart.getUTCMonth() + 1)}-01`;

        const synced = await prisma.syncedTransaction.findMany({
          where: {
            userId: report.userId,
            userSoftDeleted: false,
            date: { gte: start, lt: end },
          },
        });

        transactions = {
          transactions: synced.map((t) => ({
            id: t.id,
            reportId: report.id,
            userId: report.userId,
            account_id: t.account_id,
            transaction_id: t.transaction_id,
            name: t.merchant_name ?? t.name,
            amount: t.amount,
            date: t.date,
            category: [resolveCategory(t)],
            notes: t.notes,
            createdAt: t.createdAt,
          })),
        };
      } else {
        transactions = report ? { transactions: report.transactions } : null;
      }
    }

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
  transactions: TransactionWithNotes[],
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
            approvedAt: new Date(),
            ...formattedReport,
            transactions: {
              create: formattedTransactions,
            },
          },
        },
      },
    });

    response = {
      success: true,
    };
  } catch (error: any) {
    console.log(error?.message);
    response = {
      success: false,
      error,
    };
  }

  return response;
};

export const createRecurringReport = async (
  prisma: PrismaClient,
  report: RecurringReportData,
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

    const {inflow, outflow, inflowTransactions, outflowTransactions, total} = report;

    await prisma.$transaction(async (tx) => {
      const createdReport = await tx.recurringReport.create({
        data: {
          reportName,
          inflow,
          outflow,
          total: Number(total),
          userId: user.id,
        },
      });

      await tx.recurringTransaction.createMany({
        data: inflowTransactions.map(transaction => ({
          ...transaction,
          userId: user.id,
          inflowReportId: createdReport.id,
        })),
      });

      await tx.recurringTransaction.createMany({
        data: outflowTransactions.map(transaction => ({
          ...transaction,
          userId: user.id,
          outflowReportId: createdReport.id,
        })),
      });
    });

    response = {
      success: true,
    };
  } catch (error: any) {
    console.log(error?.message);
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
  transactions: TransactionWithNotes[],
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

    const existingReport = await prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        userId: true,
        status: true,
        reportType: true,
        month: true,
        year: true,
      },
    });

    if (!existingReport || existingReport.userId !== user.id) {
      return (response = {
        success: false,
        error: "Report not found",
      });
    }

    const isPendingMonthly =
      existingReport.reportType === ReportType.MONTHLY &&
      (existingReport.status === ReportStatus.DRAFT ||
        existingReport.status === ReportStatus.PENDING_APPROVAL) &&
      existingReport.month != null &&
      existingReport.year != null;

    if (isPendingMonthly) {
      // Pending monthly reports persist edits on SyncedTransaction:
      //   - removed rows  → userSoftDeleted = true
      //   - kept rows     → userCategoryOverride (if changed from natural) + notes
      // Manually-added rows (LOCAL_ACCOUNT_ID) are skipped — they have no
      // SyncedTransaction to attach to. The edit UI hides those affordances
      // when the report is pending, so this is a defense-in-depth no-op.
      const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const start = `${existingReport.year}-${pad2(existingReport.month!)}-01`;
      const nextMonthStart = new Date(
        Date.UTC(existingReport.year!, existingReport.month!, 1)
      );
      const end =
        `${nextMonthStart.getUTCFullYear()}-` +
        `${pad2(nextMonthStart.getUTCMonth() + 1)}-01`;

      const liveSynced = await prisma.syncedTransaction.findMany({
        where: {
          userId: user.id,
          userSoftDeleted: false,
          date: { gte: start, lt: end },
        },
      });

      const payloadById = new Map<string, TransactionWithNotes>();
      for (const t of transactions) {
        if (t.account_id === LOCAL_ACCOUNT_ID) continue;
        payloadById.set(t.transaction_id, t);
      }

      await prisma.$transaction(async (tx) => {
        for (const existing of liveSynced) {
          const edited = payloadById.get(existing.transaction_id);
          if (!edited) {
            await tx.syncedTransaction.update({
              where: { id: existing.id },
              data: { userSoftDeleted: true },
            });
            continue;
          }

          const naturalCategory = resolveCategory({
            category: existing.category,
            merchant_name: existing.merchant_name,
            name: existing.name,
            userCategoryOverride: null,
          });
          const desiredCategory = edited.category?.[0] ?? null;
          const override =
            desiredCategory && desiredCategory !== naturalCategory
              ? desiredCategory
              : null;

          await tx.syncedTransaction.update({
            where: { id: existing.id },
            data: {
              userSoftDeleted: false,
              userCategoryOverride: override,
              notes: edited.notes ?? null,
            },
          });
        }
      });

      const refreshed = await prisma.syncedTransaction.findMany({
        where: {
          userId: user.id,
          userSoftDeleted: false,
          date: { gte: start, lt: end },
        },
      });
      const totals = computeReportTotals(refreshed);

      await prisma.report.update({
        where: { id: reportId },
        data: {
          reportName,
          ...totals,
          autoMaintainedAt: new Date(),
        },
      });

      return (response = { success: true });
    }

    // Approved monthly + annual reports: existing blow-away+recreate flow.
    await prisma.transaction.deleteMany({
      where: {
        reportId,
      },
    });

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
          create: formattedTransactions,
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
      
      // Recompute report totals from transactions: revenue positive, expenses negative, total = revenue + expenses (matches edit/create logic).
      await prisma.$executeRaw`
        WITH expense_aggregation AS (
          SELECT COALESCE(SUM(amount), 0) * -1 AS total_expenses
          FROM "Transaction"
          WHERE "reportId" = ${reportId_1} AND (LOWER("category"[1]) <> 'revenue' OR "category"[1] IS NULL)
        ), revenue_aggregation AS (
          SELECT COALESCE(SUM(ABS(amount)), 0) AS total_revenue
          FROM "Transaction"
          WHERE "reportId" = ${reportId_1} AND LOWER("category"[1]) = 'revenue'
        )
        UPDATE "Report"
        SET "expenses" = (SELECT total_expenses FROM expense_aggregation),
            "revenue" = (SELECT total_revenue FROM revenue_aggregation),
            "total" = (SELECT total_revenue FROM revenue_aggregation) + (SELECT total_expenses FROM expense_aggregation)
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

export const createAnnualReport = async (
  prisma: PrismaClient,
  reports: ReportDataDTO[],
  monthlyReportIds: number[],
  annualReportName: string,
  userEmail: string
): Promise<PrismaResponse> => {
  let response: PrismaResponse = {
    success: false,
  };

  try {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true },
    });

    if (!user) {
      return {
        success: false,
        error: "User not found",
      };
    }

    // Aggregate category values
    const aggregatedValues = reports.reduce(
      (totals, report) => ({
        foodAndDrink: totals.foodAndDrink + report.foodAndDrink,
        billsAndUtilities: totals.billsAndUtilities + report.billsAndUtilities,
        car: totals.car + report.car,
        entertainment: totals.entertainment + report.entertainment,
        groceries: totals.groceries + report.groceries,
        healthAndWellness: totals.healthAndWellness + report.healthAndWellness,
        personal: totals.personal + report.personal,
        shopping: totals.shopping + report.shopping,
        feesAndAdjustments: totals.feesAndAdjustments + report.feesAndAdjustments,
        others: totals.others + report.others,
        revenue: totals.revenue + report.revenue,
        foster: totals.foster + report.foster,
        expenses: totals.expenses + report.expenses,
        total: totals.total + report.total,
      }),
      {
        foodAndDrink: 0,
        billsAndUtilities: 0,
        car: 0,
        entertainment: 0,
        groceries: 0,
        healthAndWellness: 0,
        personal: 0,
        shopping: 0,
        feesAndAdjustments: 0,
        others: 0,
        revenue: 0,
        foster: 0,
        expenses: 0,
        total: 0,
      }
    );

    // Create the annual report
    const annualReport = await prisma.report.create({
      data: {
        reportName: annualReportName,
        reportType: "ANNUAL",
        approvedAt: new Date(),
        user: { connect: { id: user.id } },
        childReports: {
          connect: monthlyReportIds.map((id) => ({ id })),
        },
        ...aggregatedValues,
      },
    });

    response = {
      success: true,
      data: annualReport,
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
