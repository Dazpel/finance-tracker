import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import prisma from "@lib/prisma/prismaClient";
import { upsertCurrentMonthDraftReport } from "@lib/reports/draftReport";

type Body = {
  userCategoryOverride?: string | null;
  userSoftDeleted?: boolean;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await getServerSession(options);
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    body.userCategoryOverride === undefined &&
    body.userSoftDeleted === undefined
  ) {
    return NextResponse.json(
      { error: "No editable fields supplied" },
      { status: 400 }
    );
  }

  const row = await prisma.syncedTransaction.findUnique({
    where: { id },
    select: { userId: true, user: { select: { email: true } } },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.user.email !== userEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: Body = {};
  if (body.userCategoryOverride !== undefined) {
    data.userCategoryOverride = body.userCategoryOverride;
  }
  if (body.userSoftDeleted !== undefined) {
    data.userSoftDeleted = body.userSoftDeleted;
  }

  await prisma.syncedTransaction.update({ where: { id }, data });

  try {
    await upsertCurrentMonthDraftReport(row.userId);
  } catch (err) {
    console.error("Draft recompute after PATCH failed:", err);
  }

  return NextResponse.json({ success: true });
}
