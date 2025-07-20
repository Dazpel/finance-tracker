import { options } from "@api/auth/[...nextauth]/options";
import { createAnnualReport } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";

export async function POST(request: Request) {
  const session = await getServerSession(options);
  const res = await request.json();
  const reportIds = res.reportIds;
  const reportName = res.reportName;
  const reports = res.reports;

  if (!reportIds || !reportName) {
    return Response.json({
      success: false,
      error: "Missing reportIds or reportName",
    });
  }
  
  try {
    const response = await createAnnualReport(
      prisma,
      reports,
      reportIds,
      reportName,
      session.user.email
    );

    if (!response.success) {
      return Response.json({
        success: false,
        error: "Failed to create anual report",
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
