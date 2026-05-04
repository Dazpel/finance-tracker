/**
 * Force-runs checkThresholdsAndNotify against April 2026 for a given user.
 * Selects ExpoPushNotifier when the user has any PushToken rows; otherwise
 * falls back to EmailNotifier (same logic as production).
 *
 * Usage:
 *   pnpm dlx tsx --env-file=.env scripts/test-threshold-check-april.ts <email> [--clear-logs] [--dry-run]
 *
 * Flags:
 *   --clear-logs  Delete NotificationLog rows for (user, "2026-04") before running so
 *                 already-fired levels can re-fire on this run.
 *   --dry-run     Compute alerts but don't write logs or dispatch notifications.
 */
import prisma from "../src/lib/prisma/prismaClient";
import { checkThresholdsAndNotify } from "../src/lib/notifications/thresholdCheck";

const APRIL_2026 = new Date(Date.UTC(2026, 3, 15));

const main = async () => {
  const email = process.argv[2];
  const clearLogs = process.argv.includes("--clear-logs");
  const dryRun = process.argv.includes("--dry-run");

  if (!email) {
    console.error(
      "Usage: test-threshold-check-april.ts <email> [--clear-logs] [--dry-run]"
    );
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error(`No user found for "${email}"`);
    process.exit(1);
  }

  if (clearLogs) {
    const { count } = await prisma.notificationLog.deleteMany({
      where: { userId: user.id, month: "2026-04" },
    });
    console.log(`[clear-logs] deleted ${count} NotificationLog rows for 2026-04`);
  }

  const tokenCount = await prisma.pushToken.count({ where: { userId: user.id } });
  console.log(
    `[ctx] user=${user.email} userId=${user.id} pushTokens=${tokenCount} ` +
      `(channel will be ${tokenCount > 0 ? "PUSH" : "EMAIL"})`
  );

  console.log(`[run] checkThresholdsAndNotify(now=April 15 2026)${dryRun ? " [dry-run]" : ""}`);
  const { fired } = await checkThresholdsAndNotify(
    user.id,
    APRIL_2026,
    undefined,
    { dryRun }
  );

  if (fired.length === 0) {
    console.log("[result] No alerts fired.");
  } else {
    console.log(`[result] ${fired.length} alert(s):`);
    for (const a of fired) {
      console.log(
        `  - ${a.category} / ${a.level}  spent=$${a.spent.toFixed(2)}  limit=$${a.limit.toFixed(2)}  month=${a.monthKey}`
      );
    }
  }
};

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
