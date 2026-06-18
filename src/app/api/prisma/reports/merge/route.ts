import { options } from "@api/auth/[...nextauth]/options";
import { mergeReports } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";
import { isUuid } from "@lib/validation/uuidSchemas";

export async function POST(request: Request) {
  const session = await getServerSession(options);

  if (!session?.user?.email) {
    return Response.json(
      { success: false, error: "Unauthenticated" },
      { status: 401 }
    );
  }

  const res = await request.json();
  const reportId_1 = res.reportId_1;
  const reportId_2 = res.reportId_2;

  if (!reportId_1 || !reportId_2) {
    return Response.json({
      success: false,
      error: "Missing reportId_1 or reportId_2",
    });
  }

  if (!isUuid(reportId_1) || !isUuid(reportId_2)) {
    return Response.json(
      { success: false, error: "Invalid reportId" },
      { status: 400 }
    );
  }

  try {
    const response = await mergeReports(
      prisma,
      reportId_1,
      reportId_2,
      session.user.email
    );

    if (!response.success) {
      return Response.json({
        success: false,
        error: "Failed to merge reports",
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({
      success: false,
      error: error,
    });
  }
}
