import { options } from "@api/auth/[...nextauth]/options";
import { getRecurringTransactions } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";
import { isUuid } from "@lib/validation/uuidSchemas";

export async function GET(request: Request) {
  const session = await getServerSession(options);
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('reportId')

  if (!isUuid(id)) {
    return Response.json(
      { success: false, error: "Invalid reportId" },
      { status: 400 }
    );
  }

  try {
    const response = await getRecurringTransactions(
      prisma,
      session.user.email,
      id
    );

    return Response.json({ success: true, response });
  } catch (error) {
    return Response.json({
      success: false,
      error: error,
    });
  }
}
