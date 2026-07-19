import { NextResponse } from "next/server";
import prisma from "@lib/prisma/prismaClient";
import { syncTransactionsForAccount } from "@lib/plaid/syncTransactions";
import {
  STALE_THRESHOLD_MS,
  MAX_ACCOUNTS_PER_RUN,
  prioritizeStaleAccounts,
} from "./_utils/selectStaleAccounts";

export const maxDuration = 60;

export async function POST(request: Request) {
  const initTimer = Date.now();
  try {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured");
      return NextResponse.json(
        { message: "Server misconfiguration" },
        { status: 500 }
      );
    }
    if (
      request.headers.get("Authorization") !==
      `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json(
        { message: "Invalid authorization header" },
        { status: 401 }
      );
    }

    console.log("-----------------------------------");
    console.log("------- Sync stale Plaid transactions -------");
    console.log("-----------------------------------");

    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
    // Fetching all stale candidates is fine — this app's account count is small.
    // JS prioritization below then caps the actual work to MAX_ACCOUNTS_PER_RUN.
    const candidates = await prisma.plaidAccount.findMany({
      where: {
        OR: [{ cursor: { is: null } }, { cursor: { lastSyncAt: { lt: cutoff } } }],
      },
      select: { id: true, institutionName: true, cursor: { select: { lastSyncAt: true } } },
    });

    const toSync = prioritizeStaleAccounts(candidates, MAX_ACCOUNTS_PER_RUN);

    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const acc of toSync) {
      try {
        const result = await syncTransactionsForAccount(acc.id);
        if (result.skipped) {
          skipped++;
        } else {
          synced++;
        }
      } catch (err) {
        failed++;
        console.error(
          `[sync-plaid-transactions-cron] sync failed account=${acc.id}:`,
          err
        );
      }
    }

    console.log(
      `Synced ${synced} accounts (skipped: ${skipped}, failed: ${failed}) out of ${candidates.length} stale candidates.`
    );

    return NextResponse.json(
      { processed: synced, skipped, failed, candidates: candidates.length },
      { status: 200 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    console.log(`Time taken: ${Date.now() - initTimer}ms`);
  }
}
