import { Prisma, type NotificationLevel } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import {
  EXPENSE_KEYS,
  EXPENSE_KEY_TO_DISPLAY,
  levelsCrossed,
  type ExpenseKey,
} from "./expenseKeys";
import { toMonthKey } from "./monthKey";
import {
  getDefaultNotifier,
  type Notifier,
} from "./notifier";
import type { Alert } from "./templates";

export type CheckOptions = {
  dryRun?: boolean;
};

export async function checkThresholdsAndNotify(
  userId: string,
  now: Date = new Date(),
  notifier: Notifier = getDefaultNotifier(),
  options: CheckOptions = {}
): Promise<{ fired: Alert[] }> {
  const monthKey = toMonthKey(now);
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  const [thresholds, report, existingLogs] = await Promise.all([
    prisma.expenseThreshold.findUnique({ where: { userId } }),
    prisma.report.findFirst({
      where: {
        userId,
        month,
        year,
        reportType: "MONTHLY",
        autoMaintainedAt: { not: null },
      },
    }),
    prisma.notificationLog.findMany({
      where: { userId, month: monthKey },
      select: { category: true, level: true },
    }),
  ]);

  if (!thresholds || !report) return { fired: [] };

  const firedKey = (category: string, level: NotificationLevel) =>
    `${category}::${level}`;
  const alreadyFired = new Set(
    existingLogs.map((l) => firedKey(l.category, l.level))
  );

  // Per category, collect every newly-crossed (not-yet-logged) level. We will
  // write log rows for ALL of them (so lower levels can't re-alert later if
  // spend dips back through them) but dispatch only ONE alert per category —
  // the highest crossed level — so the user gets a single, most-relevant
  // notification per category per run.
  type CategoryFiring = {
    category: string;
    spent: number;
    limit: number;
    newlyCrossed: NotificationLevel[]; // ascending: WARNING_70 → REACHED_100 → EXCEEDED
  };

  const firings: CategoryFiring[] = [];
  for (const key of EXPENSE_KEYS) {
    const limit = (thresholds as unknown as Record<ExpenseKey, number>)[key];
    const spent = (report as unknown as Record<ExpenseKey, number>)[key];
    const display = EXPENSE_KEY_TO_DISPLAY[key];
    const newlyCrossed = levelsCrossed(spent, limit).filter(
      (level) => !alreadyFired.has(firedKey(display, level))
    );
    if (newlyCrossed.length === 0) continue;
    firings.push({ category: display, spent, limit, newlyCrossed });
  }

  if (firings.length === 0) return { fired: [] };

  if (options.dryRun) {
    return {
      fired: firings.map((f) => ({
        category: f.category,
        level: f.newlyCrossed[f.newlyCrossed.length - 1],
        spent: f.spent,
        limit: f.limit,
        monthKey,
      })),
    };
  }

  // Confirm the notifier can actually send before we write any NotificationLog
  // rows. Otherwise a misconfigured deploy would commit phantom rows that the
  // dedupe key permanently suppresses, silently losing alerts.
  try {
    notifier.assertReady();
  } catch (e) {
    console.error(
      `[thresholdCheck] notifier not ready, skipping ${firings.length} category firing(s) for user=${userId}:`,
      e
    );
    return { fired: [] };
  }

  const dispatched: Alert[] = [];
  for (const f of firings) {
    // Track the highest level WE committed this run. If a P2002 swallowed an
    // insert, another concurrent worker is responsible for that level (and
    // for whatever it dispatches). We only dispatch the highest level we
    // ourselves logged — that preserves the "log first, dispatch on success"
    // race protection.
    let highestCommittedThisRun: NotificationLevel | null = null;
    for (const level of f.newlyCrossed) {
      try {
        await prisma.notificationLog.create({
          data: {
            userId,
            category: f.category,
            level,
            month: monthKey,
            channel: notifier.channel,
          },
        });
        highestCommittedThisRun = level;
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          // Another concurrent worker already wrote this log row.
          continue;
        }
        console.error(
          `[thresholdCheck] failed to write NotificationLog for user=${userId} ${f.category}/${level}:`,
          e
        );
      }
    }
    if (highestCommittedThisRun) {
      dispatched.push({
        category: f.category,
        level: highestCommittedThisRun,
        spent: f.spent,
        limit: f.limit,
        monthKey,
      });
    }
  }

  if (dispatched.length > 0) {
    try {
      await notifier.dispatch(userId, dispatched);
    } catch (e) {
      console.error(
        `[thresholdCheck] notifier.dispatch failed for user=${userId} (${dispatched.length} alerts) — log rows committed, alerts will not retry:`,
        e
      );
    }
  }

  return { fired: dispatched };
}
