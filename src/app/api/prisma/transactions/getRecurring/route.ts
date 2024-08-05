import { options } from "@api/auth/[...nextauth]/options";
import { getRecurringTransactions } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";

export async function GET(request: Request) {
  const session = await getServerSession(options);
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('reportId')

  try {
    const response = await getRecurringTransactions(
      prisma,
      session.user.email,
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
