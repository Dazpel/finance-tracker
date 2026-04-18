import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import prisma from "@lib/prisma/prismaClient";

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

export async function GET(req: Request) {
  const session = await getServerSession(options);
  if (!session?.user?.email) {
    return Response.json({ success: false, error: "Session not found" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const accountId = searchParams.get("accountId");
  const cursor = searchParams.get("cursor");

  const rawTake = Number(searchParams.get("take"));
  const take = Number.isFinite(rawTake) && rawTake > 0
    ? Math.min(Math.floor(rawTake), MAX_TAKE)
    : DEFAULT_TAKE;

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
      take,
      skip: cursor ? 1 : 0,
      ...(cursor ? { cursor: { id: cursor } } : {}),
      orderBy: [{ date: "desc" }, { id: "desc" }],
      select: {
        id: true,
        transaction_id: true,
        account_id: true,
        name: true,
        merchant_name: true,
        amount: true,
        date: true,
        category: true,
        notes: true,
      },
    });

    const nextCursor = transactions.length === take
      ? transactions[transactions.length - 1].id
      : null;

    return Response.json({ success: true, transactions, nextCursor });
  } catch (error) {
    console.error("Failed to load synced transactions:", error);
    return Response.json({ success: false, error: "Failed to load transactions" }, { status: 500 });
  }
}
