import { options } from "@api/auth/[...nextauth]/options";
import { getReports } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";

export async function GET() {
  const session = await getServerSession(options);

  try {
    const response = await getReports(prisma, session.user.email);

    return Response.json({ success: true, response });
  } catch (error) {
    return Response.json({
      success: false,
      error: error,
    });
  }
}
