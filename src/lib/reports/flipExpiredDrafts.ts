import prisma from "@lib/prisma/prismaClient";
import { ReportStatus, ReportType } from "@generated/prisma/browser";
import { GRACE_WINDOW_DAYS } from "./draftReport";

// Sweeps any auto-maintained DRAFT MONTHLY reports whose grace window has
// elapsed and flips them to PENDING_APPROVAL in a single atomic updateMany.
//
// Independent of getEligibleDraftMonths so a month that was skipped (e.g. the
// user wasn't synced during the first 7 days of the following month) still
// transitions on the next sync instead of being stranded as DRAFT forever.
export async function flipExpiredDraftsForUser(
  userId: string,
  now: Date = new Date()
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - GRACE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
  const cutoffYear = cutoff.getUTCFullYear();
  const cutoffMonth = cutoff.getUTCMonth() + 1;

  const { count } = await prisma.report.updateMany({
    where: {
      userId,
      reportType: ReportType.MONTHLY,
      status: ReportStatus.DRAFT,
      autoMaintainedAt: { not: null },
      OR: [
        { year: { lt: cutoffYear } },
        { year: cutoffYear, month: { lt: cutoffMonth } },
      ],
    },
    data: { status: ReportStatus.PENDING_APPROVAL },
  });

  return count;
}
