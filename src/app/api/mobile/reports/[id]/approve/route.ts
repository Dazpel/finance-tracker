import { requireMobileUser } from "@lib/auth/requireMobileUser";
import { approveReport } from "@lib/reports/approveReport";
import { isUuid } from "@lib/validation/uuidSchemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  if (!isUuid(rawId)) {
    return Response.json(
      { success: false, error: "Invalid id" },
      { status: 400 }
    );
  }
  const id = rawId;

  try {
    const result = await approveReport({ userId: auth.user.id, reportId: id });
    if (!result.ok) {
      return Response.json(
        { success: false, error: result.message },
        { status: result.httpStatus }
      );
    }
    return Response.json({
      success: true,
      response: {
        id: result.report.id,
        status: result.report.status,
        approvedAt: result.report.approvedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[/api/mobile/reports/[id]/approve]", error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
