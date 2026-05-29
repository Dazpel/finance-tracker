import type { ExpenseThreshold, Report } from "@prisma/client";

export type MobileReportResponse = {
  report: Report;
  thresholds: ExpenseThreshold;
  monthLabel: string;
  status: Report["status"];
  approvedAt: string | null;
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
  return {
    report,
    thresholds,
    monthLabel: buildMonthLabel(report),
    status: report.status,
    approvedAt: report.approvedAt ? report.approvedAt.toISOString() : null,
  };
}
