import type { ExpenseThreshold, Report } from "@prisma/client";

// Wire-safe variant of Report: Date fields serialized to ISO strings as
// they appear after JSON.stringify (Response.json). Only fields the mobile
// client reads are listed; the rest carry over from the Prisma type.
export type SerializedReport = Omit<
  Report,
  "approvedAt" | "autoMaintainedAt" | "createdAt" | "updatedAt"
> & {
  approvedAt: string | null;
  autoMaintainedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MobileReportResponse = {
  report: SerializedReport;
  thresholds: ExpenseThreshold;
  monthLabel: string;
};

function buildMonthLabel(report: Report): string {
  if (report.month != null && report.year != null) {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(report.year, report.month - 1, 1)));
  }
  return report.reportName;
}

export function buildMobileReportResponse(
  report: Report,
  thresholds: ExpenseThreshold
): MobileReportResponse {
  const serializedReport: SerializedReport = {
    ...report,
    approvedAt: report.approvedAt ? report.approvedAt.toISOString() : null,
    autoMaintainedAt: report.autoMaintainedAt
      ? report.autoMaintainedAt.toISOString()
      : null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
  return {
    report: serializedReport,
    thresholds,
    monthLabel: buildMonthLabel(report),
  };
}
