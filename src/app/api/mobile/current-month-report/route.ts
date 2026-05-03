import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";

export async function GET(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  try {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    const monthLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(now);

    const [report, thresholds] = await Promise.all([
      prisma.report.findFirst({
        where: {
          userId: auth.user.id,
          month,
          year,
          reportType: "MONTHLY",
          autoMaintainedAt: { not: null },
        },
      }),
      prisma.expenseThreshold.upsert({
        where: { userId: auth.user.id },
        update: {},
        create: { userId: auth.user.id },
      }),
    ]);

    return Response.json({
      success: true,
      response: { report, thresholds, monthLabel },
    });
  } catch (error) {
    console.error("[/api/mobile/current-month-report]", error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
