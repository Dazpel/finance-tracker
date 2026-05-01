import { options } from "@api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";

export async function GET() {
  const session = await getServerSession(options);
  const email = session?.user?.email;
  if (!email) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return Response.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Lazily create the row if it doesn't exist (covers any race on the seed
    // backfill). @default values populate the columns.
    const thresholds = await prisma.expenseThreshold.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    return Response.json({ success: true, response: thresholds });
  } catch (error) {
    console.error("[/api/prisma/thresholds/get]", error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
