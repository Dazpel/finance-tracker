import { NextResponse } from "next/server";
import prisma from "@lib/prisma/prismaClient";

export async function POST(request: Request) {
  try {
    if (
      request.headers.get("Authorization") !==
      `Bearer ${process.env.CRON_SECRET}`
    ) {
      return Response.json(
        { message: "Invalid authorization header" },
        { status: 200 }
      );
    }
    console.log("-----------------------------------");
    console.log("------- Request to create bi-weekly report -------");
    console.log("-----------------------------------");

    const reports = await prisma.report.findMany({
      select: {
        reportName: true,
      },
    });

    console.log(reports);

    return NextResponse.json({ status: 200 });
  } catch (error) {
    console.log(error);
    return NextResponse.json({ status: 500 });
  }
}
