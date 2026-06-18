import prisma from "@lib/prisma/prismaClient";
import { requireMobileUser } from "@lib/auth/requireMobileUser";
import { buildMobileReportResponse } from "@lib/reports/buildMobileReportResponse";
import { isUuid } from "@lib/validation/uuidSchemas";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  try {
    const { id: rawId } = await params;
    if (!isUuid(rawId)) {
      return Response.json(
        { success: false, error: "Invalid id" },
        { status: 400 }
      );
    }
    const id = rawId;

    const [report, thresholds] = await Promise.all([
      prisma.report.findFirst({
        where: { id, userId: auth.user.id },
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
    console.error("[/api/mobile/reports/[id]]", error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
