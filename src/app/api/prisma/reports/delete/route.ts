import { options } from "@api/auth/[...nextauth]/options";
import { deleteReport } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";
import { isUuid } from "@lib/validation/uuidSchemas";

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

  if (!isUuid(id)) {
    return Response.json(
      { success: false, error: "Invalid reportId" },
      { status: 400 }
    );
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
