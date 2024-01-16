import { options } from "@api/auth/[...nextauth]/options";
import { updateReport } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";

export async function POST(request: Request) {
  const session = await getServerSession(options);
  const res = await request.json();
  const transactions = res.transactions;
  const reportData = res.reportData;
  const reportName = res.reportName;
  const reportId = res.reportId;

  if (!transactions || !reportData) {
    return Response.json({
      success: false,
      error: "Missing transactions or reportData",
    });
  }

  try {
    const response = await updateReport(
      prisma,
      transactions,
      reportId,
      reportData,
      reportName,
      session.user.email
    );

    if (!response.success) {
      return Response.json({
        success: false,
        error: "Failed to update report",
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
