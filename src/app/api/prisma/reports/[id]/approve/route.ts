import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import prisma from "@lib/prisma/prismaClient";
import { ReportStatus, ReportType } from "@prisma/client";
import { isMonthFullyPast, resolveCategory } from "@lib/reports/draftReport";

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

  const report = await prisma.report.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (report.user.email !== userEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (report.reportType !== ReportType.MONTHLY) {
    return NextResponse.json(
      { error: "Only monthly reports can be approved" },
      { status: 400 }
    );
  }
  if (
    report.status !== ReportStatus.DRAFT &&
    report.status !== ReportStatus.PENDING_APPROVAL
  ) {
    return NextResponse.json(
      { error: `Report is already ${report.status}` },
      { status: 409 }
    );
  }
  if (report.month == null || report.year == null) {
    return NextResponse.json(
      { error: "Report missing month/year" },
      { status: 500 }
    );
  }

  const target = { month: report.month, year: report.year };
  if (!isMonthFullyPast(target, new Date())) {
    return NextResponse.json(
      { error: "Cannot approve a report for the current or future month" },
      { status: 400 }
    );
  }

  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const start = `${target.year}-${pad2(target.month)}-01`;
  const nextMonthStart = new Date(Date.UTC(target.year, target.month, 1));
  const end =
    `${nextMonthStart.getUTCFullYear()}-` +
    `${pad2(nextMonthStart.getUTCMonth() + 1)}-01`;

  const synced = await prisma.syncedTransaction.findMany({
    where: {
      userId: report.userId,
      userSoftDeleted: false,
      date: { gte: start, lt: end },
    },
  });

  await prisma.$transaction([
    prisma.transaction.createMany({
      data: synced.map((t) => ({
        reportId: report.id,
        userId: report.userId,
        account_id: t.account_id,
        transaction_id: t.transaction_id,
        name: t.merchant_name ?? t.name,
        amount: t.amount,
        date: t.date,
        category: [resolveCategory(t)],
        notes: t.notes,
      })),
    }),
    prisma.report.update({
      where: { id: report.id },
      data: {
        status: ReportStatus.APPROVED,
        approvedAt: new Date(),
      },
    }),
  ]);

  return NextResponse.json({ success: true, transactionsAdded: synced.length });
}
