import prisma from "@lib/prisma/prismaClient";
import { ReportStatus, ReportType } from "@prisma/client";
import { requireMobileUser } from "@lib/auth/requireMobileUser";
import { monthDateRange } from "@lib/reports/draftReport";
import { CATEGORY_KEY_TO_CANONICAL_NAME } from "./_utils/constants";
import { QuerySchema } from "./_utils/schemas";
import { filterAndResolve } from "./_utils/filter";
import { serializeTransaction } from "./_utils/serialize";
import { serializeFrozenTransaction } from "./_utils/serializeFrozen";

export async function GET(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    key: url.searchParams.get("key"),
    monthKey: url.searchParams.get("monthKey"),
  });
  if (!parsed.success) {
    return Response.json(
      { success: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { key, monthKey } = parsed.data;
  const [yearStr, monthStr] = monthKey.split("-");
  const target = { year: Number(yearStr), month: Number(monthStr) };
  const canonicalName = CATEGORY_KEY_TO_CANONICAL_NAME[key];

  try {
    // Mirror prismaFunctions.getTransactions(): an approved monthly report has
    // a frozen Transaction[] snapshot whose amounts/categories are baked in at
    // approval time. The live SyncedTransaction rows can drift after approval
    // (Plaid sync mutating amount, override loss across pending→posted, manual
    // soft-delete/recategorize), so for APPROVED months we read the snapshot.
    // For DRAFT, PENDING_APPROVAL, or no-report-yet, we read live.
    const report = await prisma.report.findFirst({
      where: {
        userId: auth.user.id,
        month: target.month,
        year: target.year,
        reportType: ReportType.MONTHLY,
        autoMaintainedAt: { not: null },
      },
      select: { id: true, status: true },
    });

    if (report?.status === ReportStatus.APPROVED) {
      const rows = await prisma.transaction.findMany({
        where: {
          userId: auth.user.id,
          reportId: report.id,
          category: { has: canonicalName },
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
      });

      return Response.json({
        success: true,
        response: {
          key,
          monthKey,
          canonicalName,
          transactions: rows.map(serializeFrozenTransaction),
        },
      });
    }

    const range = monthDateRange(target);
    const rows = await prisma.syncedTransaction.findMany({
      where: {
        userId: auth.user.id,
        date: { gte: range.gte, lt: range.lt },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    const transactions = filterAndResolve(rows, canonicalName).map(serializeTransaction);

    return Response.json({
      success: true,
      response: { key, monthKey, canonicalName, transactions },
    });
  } catch (error) {
    console.error("[/api/mobile/category-transactions]", error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
