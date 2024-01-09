import React from "react";
import prisma from "@lib/prisma/prismaClient";
import { getReports } from "@lib/prisma/prismaFunctions";
import ReportsPage, { ReportsPageProps } from "./ReportsPage";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import { ReportDataDTO } from "utils/types";

const cleanReportData = (reportData: any[]): ReportDataDTO[] => {
  return reportData.map((report) => {
    const { userId, updatedAt, ...cleanReport } = report;
    return cleanReport;
  });
};

async function getReportsData(): Promise<ReportsPageProps> {
  const session = await getServerSession(options);
  let reportData: ReportDataDTO[] = [];
  try {
    const response = await getReports(prisma, session.user.email);
    if (response.success) {
      reportData =
        response.data.length > 0 ? cleanReportData(response.data) : [];
    }
  } catch (error) {
    console.log(error);
  }

  return { reportData };
}

export const dynamic = "force-dynamic";

export default async function Page() {
  const res = await getReportsData();
  return <ReportsPage {...res} />;
}
