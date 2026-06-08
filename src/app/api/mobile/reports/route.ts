import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";
import { ReportStatus, ReportType } from "@prisma/client";
import { monthDateRange } from "@lib/reports/draftReport";

export async function GET(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const typeParam = url.searchParams.get("type");
    const type =
      typeParam === "ANNUAL" ? ReportType.ANNUAL : ReportType.MONTHLY;

    const now = new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();

    const reports = await prisma.report.findMany({
      where: {
        userId: auth.user.id,
        reportType: type,
        ...(type === ReportType.MONTHLY
          ? {
              NOT: {
                AND: [
                  { month: currentMonth },
                  { year: currentYear },
                  { status: ReportStatus.DRAFT },
                  { autoMaintainedAt: { not: null } },
                ],
              },
            }
          : {}),
      },
      // Order by createdAt desc to match the web UI (api/reports/getReports +
      // ReportsPage.reverse()), which sorts purely by createdAt. Sorting by the
      // nullable year/month here instead floats legacy rows (NULL month/year,
      // predating the auto-draft system) to the top via Postgres' NULLS FIRST
      // default, pushing the newer dated reports below them.
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reportName: true,
        reportType: true,
        status: true,
        month: true,
        year: true,
        approvedAt: true,
        revenue: true,
        expenses: true,
        total: true,
        _count: { select: { transactions: true } },
      },
    });

    // For DRAFT and PENDING_APPROVAL monthly reports the frozen Transaction[]
    // snapshot is empty — count live SyncedTransaction rows instead so the
    // number agrees with what category-transactions returns.
    const liveCounts = await Promise.all(
      reports.map((r) => {
        const needsLiveCount =
          r.reportType === ReportType.MONTHLY &&
          (r.status === ReportStatus.DRAFT ||
            r.status === ReportStatus.PENDING_APPROVAL) &&
          r.month != null &&
          r.year != null;

        if (!needsLiveCount) return Promise.resolve(null);

        const range = monthDateRange({ year: r.year!, month: r.month! });
        return prisma.syncedTransaction.count({
          where: {
            userId: auth.user.id,
            userSoftDeleted: false,
            date: { gte: range.gte, lt: range.lt },
          },
        });
      })
    );

    const response = {
      reports: reports.map((r, i) => ({
        id: r.id,
        reportName: r.reportName,
        reportType: r.reportType,
        status: r.status,
        month: r.month,
        year: r.year,
        monthKey:
          r.month != null && r.year != null
            ? `${r.year}-${String(r.month).padStart(2, "0")}`
            : null,
        approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
        revenue: r.revenue,
        expenses: r.expenses,
        total: r.total,
        transactionCount: liveCounts[i] ?? r._count.transactions,
      })),
    };

    return Response.json({ success: true, response });
  } catch (error) {
    console.error("[/api/mobile/reports]", error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
