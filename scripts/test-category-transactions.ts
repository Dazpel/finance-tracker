/**
 * Smoke-tests /api/mobile/category-transactions by exercising the same branch
 * logic the route uses, against the configured DB. Prints both the live
 * SyncedTransaction view and the frozen Transaction view side-by-side, plus
 * the report status the route would observe — so a divergence between the
 * approved snapshot and the live data is visible at a glance.
 *
 * Usage:
 *   pnpm dlx tsx --env-file=.env scripts/test-category-transactions.ts <email> <key> <monthKey>
 *
 * Example:
 *   pnpm dlx tsx --env-file=.env scripts/test-category-transactions.ts you@example.com car 2026-04
 */
import { ReportStatus, ReportType } from "@prisma/client";
import prisma from "../src/lib/prisma/prismaClient";
import { monthDateRange } from "../src/lib/reports/draftReport";
import { CATEGORY_KEY_TO_CANONICAL_NAME } from "../src/app/api/mobile/category-transactions/_utils/constants";
import { filterAndResolve } from "../src/app/api/mobile/category-transactions/_utils/filter";
import { serializeTransaction } from "../src/app/api/mobile/category-transactions/_utils/serialize";
import { serializeFrozenTransaction } from "../src/app/api/mobile/category-transactions/_utils/serializeFrozen";

const fmtRow = (
  t: {
    date: string;
    name: string;
    amount: number;
    pending: boolean;
    categoryOverridden: boolean;
  }
) =>
  `  - ${t.date} | ${t.name.padEnd(30).slice(0, 30)} | $${t.amount.toFixed(2).padStart(10)} | pending=${t.pending} | overridden=${t.categoryOverridden}`;

const main = async () => {
  const email = process.argv[2];
  const key = process.argv[3] as keyof typeof CATEGORY_KEY_TO_CANONICAL_NAME;
  const monthKey = process.argv[4];
  if (!email || !key || !monthKey) {
    console.error(
      "Usage: test-category-transactions.ts <email> <key> <monthKey>"
    );
    process.exit(1);
  }
  const canonicalName = CATEGORY_KEY_TO_CANONICAL_NAME[key];
  if (!canonicalName) {
    console.error(`Unknown key: ${key}`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error(`No user for ${email}`);
    process.exit(1);
  }

  const [y, m] = monthKey.split("-").map(Number);
  const range = monthDateRange({ year: y, month: m });

  const report = await prisma.report.findFirst({
    where: {
      userId: user.id,
      month: m,
      year: y,
      reportType: ReportType.MONTHLY,
      autoMaintainedAt: { not: null },
    },
    select: { id: true, status: true },
  });

  console.log(
    `[ctx] user=${email} key=${key} canonical="${canonicalName}" monthKey=${monthKey}`
  );
  console.log(
    `[report] id=${report?.id ?? "(none)"} status=${report?.status ?? "(none)"}`
  );
  const willUseFrozen = report?.status === ReportStatus.APPROVED;
  console.log(
    `[route would use] ${willUseFrozen ? "FROZEN Transaction[]" : "LIVE SyncedTransaction"}`
  );

  // ---- Live view (the existing pre-fix branch) ----
  const syncedRows = await prisma.syncedTransaction.findMany({
    where: {
      userId: user.id,
      date: { gte: range.gte, lt: range.lt },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const syncedFiltered = filterAndResolve(syncedRows, canonicalName);
  const syncedSerialized = syncedFiltered.map(serializeTransaction);

  console.log(
    `\n[live] SyncedTransaction: ${syncedRows.length} rows in month, ${syncedFiltered.length} after category filter`
  );
  for (const t of syncedSerialized.slice(0, 10)) console.log(fmtRow(t));
  if (syncedSerialized.length > 10)
    console.log(`  … and ${syncedSerialized.length - 10} more`);

  // ---- Frozen view (the new approved-branch source of truth) ----
  if (report) {
    const frozenRows = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        reportId: report.id,
        category: { has: canonicalName },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });
    const frozenSerialized = frozenRows.map(serializeFrozenTransaction);

    console.log(
      `\n[frozen] Transaction WHERE reportId=${report.id} category has "${canonicalName}": ${frozenRows.length} rows`
    );
    for (const t of frozenSerialized.slice(0, 10)) console.log(fmtRow(t));
    if (frozenSerialized.length > 10)
      console.log(`  … and ${frozenSerialized.length - 10} more`);
  } else {
    console.log("\n[frozen] (no report found for this month — frozen path not applicable)");
  }
};

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
