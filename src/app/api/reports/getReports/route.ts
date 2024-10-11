import { options } from "@api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";
import { RecurringReportDataDTO, ReportDataDTO } from "utils/types";
import { getReports } from "@lib/prisma/prismaFunctions";
import prisma from "@lib/prisma/prismaClient";
import { NextRequest } from "next/server";

const cleanReportData = (reportData: any[], recurring: boolean): ReportDataDTO[] | RecurringReportDataDTO[] => {
  return reportData
    .map((report) => {
      if (recurring) {
        const { userId, ...cleanReport } = report;
        return cleanReport;
      }

      const { userId, updatedAt, ...cleanReport } = report;
      return cleanReport;
    })
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
};

export async function GET(request: NextRequest) {
  const session = await getServerSession(options);
  const recurring = request.nextUrl.searchParams.get("recurring") === "true" ? true : false;
  let reportData: ReportDataDTO[] | RecurringReportDataDTO[] = [];

  try {
    const response = await getReports(prisma, session.user.email, recurring);
    if (response.success) {
      reportData =
        response.data.length > 0 ? cleanReportData(response.data, recurring) : [];
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
