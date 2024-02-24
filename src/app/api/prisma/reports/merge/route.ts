import { options } from "@api/auth/[...nextauth]/options";
import { mergeReports, updateReport } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";

export async function POST(request: Request) {
  const session = await getServerSession(options);
  const res = await request.json();
  const reportId_1 = res.reportId_1;
  const reportId_2 = res.reportId_2;

  if (!reportId_1 || !reportId_2) {
    return Response.json({
      success: false,
      error: "Missing transactions or reportData",
    });
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
