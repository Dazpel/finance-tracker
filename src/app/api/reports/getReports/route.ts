import { options } from "@api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";
import { ReportDataDTO } from "utils/types";
import { getReports } from "@lib/prisma/prismaFunctions";
import prisma from "@lib/prisma/prismaClient";

const cleanReportData = (reportData: any[]): ReportDataDTO[] => {
  return reportData
    .map((report) => {
      const { userId, updatedAt, ...cleanReport } = report;
      return cleanReport;
    })
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
};

export async function GET() {
  const session = await getServerSession(options);
  let reportData: ReportDataDTO[] = [];

  try {
    const response = await getReports(prisma, session.user.email);
    if (response.success) {
      reportData =
        response.data.length > 0 ? cleanReportData(response.data) : [];
    }

    return Response.json({ success: true, reportData });
  } catch (error) {
    console.log(error);
    return Response.json({
      success: false,
      error: error,
    });
  }
}
