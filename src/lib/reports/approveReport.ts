import prisma from "@lib/prisma/prismaClient";
import { ReportStatus, ReportType } from "@prisma/client";
import {
  computeReportTotals,
  isMonthFullyPast,
  monthDateRange,
  resolveAmount,
  resolveCategory,
} from "./draftReport";

export type ApproveReportResult =
  | {
      ok: true;
      report: { id: string; status: "APPROVED"; approvedAt: Date };
      transactionsAdded: number;
    }
  | {
      ok: false;
      message: string;
      httpStatus: number;
    };

export async function approveReport(params: {
  userId: string;
  reportId: string;
}): Promise<ApproveReportResult> {
  const { userId, reportId } = params;

  const report = await prisma.report.findUnique({
    where: { id: reportId },
  });
  if (!report) {
    return { ok: false, message: "Not found", httpStatus: 404 };
  }
  if (report.userId !== userId) {
    return { ok: false, message: "Forbidden", httpStatus: 403 };
  }
  if (report.reportType !== ReportType.MONTHLY) {
    return {
      ok: false,
      message: "Only monthly reports can be approved",
      httpStatus: 400,
    };
  }
  if (report.status === ReportStatus.APPROVED) {
    return {
      ok: false,
      message: "Report is already APPROVED",
      httpStatus: 409,
    };
  }
  if (report.status === ReportStatus.DRAFT) {
    return {
      ok: false,
      message:
        "Cannot approve a report still in the 7-day grace window. Wait for status to become PENDING_APPROVAL.",
      httpStatus: 409,
    };
  }
  if (report.status !== ReportStatus.PENDING_APPROVAL) {
    return {
      ok: false,
      message: `Report is already ${report.status}`,
      httpStatus: 409,
    };
  }
  if (report.month == null || report.year == null) {
    return {
      ok: false,
      message: "Report missing month/year",
      httpStatus: 500,
    };
  }

  const target = { month: report.month, year: report.year };
  if (!isMonthFullyPast(target, new Date())) {
    return {
      ok: false,
      message: "Cannot approve a report for the current or future month",
      httpStatus: 400,
    };
  }

  const synced = await prisma.syncedTransaction.findMany({
    where: {
      userId: report.userId,
      userSoftDeleted: false,
      date: monthDateRange(target),
    },
  });

  const totals = computeReportTotals(synced);
  const approvedAt = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.report.updateMany({
        where: { id: report.id, status: ReportStatus.PENDING_APPROVAL },
        data: {
          status: ReportStatus.APPROVED,
          approvedAt,
          ...totals,
        },
      });
      if (updated.count !== 1) {
        throw new Error("ALREADY_APPROVED");
      }
      await tx.transaction.createMany({
        data: synced.map((t) => ({
          reportId: report.id,
          userId: report.userId,
          account_id: t.account_id,
          transaction_id: t.transaction_id,
          name: t.name?.trim() ? t.name : (t.merchant_name ?? ""),
          amount: resolveAmount(t),
          date: t.date,
          category: [resolveCategory(t)],
          notes: t.notes,
        })),
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_APPROVED") {
      return {
        ok: false,
        message: "Report is already APPROVED",
        httpStatus: 409,
      };
    }
    throw e;
  }

  return {
    ok: true,
    report: { id: report.id, status: "APPROVED", approvedAt },
    transactionsAdded: synced.length,
  };
}
