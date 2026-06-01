import prisma from "@lib/prisma/prismaClient";
import { ReportStatus, ReportType } from "@prisma/client";
import { requireMobileUser } from "@lib/auth/requireMobileUser";
import { monthDateRange } from "@lib/reports/draftReport";
import { CATEGORY_KEY_TO_CANONICAL_NAME } from "./_utils/constants";
import { QuerySchema } from "./_utils/schemas";
import { filterAndResolve, filterFrozenByCategory } from "./_utils/filter";
import { serializeTransaction } from "./_utils/serialize";
import { serializeFrozenTransaction } from "./_utils/serializeFrozen";

export async function GET(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const rawReportId = url.searchParams.get("reportId");
  const parsed = QuerySchema.safeParse({
    key: url.searchParams.get("key"),
    monthKey: url.searchParams.get("monthKey") ?? undefined,
    reportId: rawReportId != null ? rawReportId : undefined,
  });
  if (!parsed.success) {
    return Response.json(
      { success: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { key, monthKey, reportId } = parsed.data;
  const canonicalName = CATEGORY_KEY_TO_CANONICAL_NAME[key];

  // Derive a target month/year from monthKey when present (used for non-approved
  // month-scoped lookups). When resolving by reportId, the target is derived from
  // the resolved report's month/year instead.
  const monthKeyTarget =
    monthKey != null
      ? (() => {
          const [yearStr, monthStr] = monthKey.split("-");
          return { year: Number(yearStr), month: Number(monthStr) };
        })()
      : null;

  try {
    // Mirror prismaFunctions.getTransactions(): an approved monthly report has
    // a frozen Transaction[] snapshot whose amounts/categories are baked in at
    // approval time. The live SyncedTransaction rows can drift after approval
    // (Plaid sync mutating amount, override loss across pending→posted, manual
    // soft-delete/recategorize), so for APPROVED months we read the snapshot.
    // For DRAFT, PENDING_APPROVAL, or no-report-yet, we read live.
    const report =
      reportId != null
        ? await prisma.report.findFirst({
            where: { id: reportId, userId: auth.user.id },
            select: { id: true, status: true, month: true, year: true },
          })
        : await prisma.report.findFirst({
            where: {
              userId: auth.user.id,
              month: monthKeyTarget!.month,
              year: monthKeyTarget!.year,
              reportType: ReportType.MONTHLY,
              autoMaintainedAt: { not: null },
            },
            select: { id: true, status: true, month: true, year: true },
          });

    // When the caller explicitly asked for a specific report and it wasn't found,
    // return 404 — do NOT fall back to a month lookup.
    if (reportId != null && report == null) {
      return Response.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    // Always surface which month is being viewed. A reportId-only request omits
    // monthKey; derive it from the resolved report's month/year so the response
    // shape stays consistent (monthKey present, not undefined/omitted). Legacy
    // reports with null month/year yield null rather than an absent field.
    const resolvedMonthKey =
      monthKey ??
      (report?.month != null && report?.year != null
        ? `${report.year}-${String(report.month).padStart(2, "0")}`
        : null);

    if (report?.status === ReportStatus.APPROVED) {
      const rows = await prisma.transaction.findMany({
        where: {
          userId: auth.user.id,
          reportId: report.id,
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
      });

      const transactions = filterFrozenByCategory(rows, canonicalName).map(
        serializeFrozenTransaction
      );

      return Response.json({
        success: true,
        response: {
          key,
          monthKey: resolvedMonthKey,
          canonicalName,
          transactions,
        },
      });
    }

    // Non-approved branch: derive date range from the resolved report's
    // month/year when resolving by reportId, or from monthKey when resolving by
    // month. If a reportId-resolved report has null month/year (legacy) and is
    // not APPROVED, return an empty list rather than throwing.
    const syncTarget =
      report?.month != null && report?.year != null
        ? { month: report.month, year: report.year }
        : monthKeyTarget;

    if (syncTarget == null) {
      // reportId resolved to a non-APPROVED report with null month/year —
      // no date range to derive; return empty list.
      return Response.json({
        success: true,
        response: { key, monthKey: resolvedMonthKey, canonicalName, transactions: [] },
      });
    }

    const range = monthDateRange(syncTarget);
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
      response: { key, monthKey: resolvedMonthKey, canonicalName, transactions },
    });
  } catch (error) {
    console.error("[/api/mobile/category-transactions]", error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
