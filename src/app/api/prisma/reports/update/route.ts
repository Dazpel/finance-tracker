import { options } from "@api/auth/[...nextauth]/options";
import { updateReport } from "@lib/prisma/prismaFunctions";
import { getServerSession } from "next-auth";
import prisma from "@lib/prisma/prismaClient";
import { checkThresholdsAndNotify } from "@lib/notifications/thresholdCheck";

export async function POST(request: Request) {
  const session = await getServerSession(options);
  const res = await request.json();
  const transactions = res.transactions;
  const reportData = res.reportData;
  const reportName = res.reportName;
  const reportId = res.reportId;

  if (!transactions || !reportData) {
    return Response.json({
      success: false,
      error: "Missing transactions or reportData",
    });
  }

  try {
    const response = await updateReport(
      prisma,
      transactions,
      reportId,
      reportData,
      reportName,
      session.user.email
    );

    if (!response.success) {
      return Response.json({
        success: false,
        error: "Failed to update report",
      });
    }

    // Bulk-edit of a draft/pending monthly report changes per-category totals
    // on the current-month Report row. Fire the threshold check so a
    // newly-crossed level alerts immediately instead of waiting for the
    // next Plaid sync. Lookup is by email (route has session) since
    // updateReport doesn't return userId. checkThresholdsAndNotify is a
    // no-op when no current-month auto-maintained report exists, so it's
    // safe to call unconditionally (covers edits to past/approved
    // reports too).
    try {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      if (user) await checkThresholdsAndNotify(user.id);
    } catch (err) {
      console.error("[reports/update] threshold check failed:", err);
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({
      success: false,
      error: error,
    });
  }
}
