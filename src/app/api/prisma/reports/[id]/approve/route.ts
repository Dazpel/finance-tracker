import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import prisma from "@lib/prisma/prismaClient";
import { approveReport } from "@lib/reports/approveReport";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const session = await getServerSession(options);
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await approveReport({ userId: user.id, reportId: id });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.httpStatus }
    );
  }
  return NextResponse.json({
    success: true,
    transactionsAdded: result.transactionsAdded,
  });
}
