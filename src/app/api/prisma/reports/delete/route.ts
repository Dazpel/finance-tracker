import { options } from "@api/auth/[...nextauth]/options";
import { deleteReport } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";

export async function POST(request: Request) {
  const session = await getServerSession(options);
  const res = await request.json();
  const id = res.reportId;

  if (!id) {
    return Response.json({
      success: false,
      error: "Missing reportId",
    });
  }

  try {
    const response = await deleteReport(prisma, id, session.user.email);
    
    if (!response.success) {
      return Response.json({
        success: false,
        error: "Failed to delete report",
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
