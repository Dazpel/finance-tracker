import { options } from "@api/auth/[...nextauth]/options";
import { getTransactions, PrismaResponse } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";
import { ReportType } from "@prisma/client";

export async function GET(request: Request) {
  const session = await getServerSession(options);
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('reportId')
  const reportType = searchParams.get('reportType')

  try {
    const response = await getTransactions(
      prisma,
      session.user.email,
      reportType as ReportType,
      id as string
    );

    return Response.json({ success: true, response });
  } catch (error) {
    return Response.json({
      success: false,
      error: error,
    });
  }
}
