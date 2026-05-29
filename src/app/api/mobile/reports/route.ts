import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";
import { ReportStatus, ReportType } from "@prisma/client";

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
      orderBy: [
        { year: "desc" },
        { month: "desc" },
        { createdAt: "desc" },
      ],
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

    const response = {
      reports: reports.map((r) => ({
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
        transactionCount: r._count.transactions,
      })),
    };

    return Response.json({ success: true, response });
  } catch (error) {
    console.error("[/api/mobile/reports]", error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
