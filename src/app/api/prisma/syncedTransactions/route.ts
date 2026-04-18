import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import prisma from "@lib/prisma/prismaClient";

export async function GET(req: Request) {
  const session = await getServerSession(options);
  if (!session?.user?.email) {
    return Response.json({ success: false, error: "Session not found" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const accountId = searchParams.get("accountId");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return Response.json({ success: false, error: "User not found" }, { status: 404 });
  }

  const where: {
    userId: string;
    date?: { gte?: string; lte?: string };
    account_id?: string;
  } = { userId: user.id };

  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = startDate;
    if (endDate) where.date.lte = endDate;
  }
  if (accountId) where.account_id = accountId;

  try {
    const transactions = await prisma.syncedTransaction.findMany({
      where,
      orderBy: { date: "desc" },
    });

    return Response.json({ success: true, transactions });
  } catch (error) {
    console.error("Failed to load synced transactions:", error);
    return Response.json({ success: false, error: "Failed to load transactions" }, { status: 500 });
  }
}
