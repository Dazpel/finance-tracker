import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";
import { buildMobileReportResponse } from "@lib/reports/buildMobileReportResponse";
import { ReportType } from "@prisma/client";

const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ monthKey: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  try {
    const { monthKey } = await params;
    const match = MONTH_KEY_RE.exec(monthKey);
    if (!match) {
      return Response.json(
        { success: false, error: "Invalid monthKey (expected YYYY-MM)" },
        { status: 400 }
      );
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
      return Response.json(
        { success: false, error: "Invalid monthKey (month out of range)" },
        { status: 400 }
      );
    }

    const [report, thresholds] = await Promise.all([
      prisma.report.findFirst({
        where: {
          userId: auth.user.id,
          reportType: ReportType.MONTHLY,
          month,
          year,
        },
      }),
      prisma.expenseThreshold.upsert({
        where: { userId: auth.user.id },
        update: {},
        create: { userId: auth.user.id },
      }),
    ]);

    if (!report) {
      return Response.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      response: buildMobileReportResponse(report, thresholds),
    });
  } catch (error) {
    console.error("[/api/mobile/reports/by-month/[monthKey]]", error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
