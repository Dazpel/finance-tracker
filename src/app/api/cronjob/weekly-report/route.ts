import { NextResponse } from "next/server";
import prisma from "@lib/prisma/prismaClient";
import { ReportType } from "@prisma/client";
import { formatToDefaultCategories } from "utils/functions";
import { sendWeeklyReportEmail } from "utils/emailTemplates";

export const maxDuration = 20;

const CATEGORY_KEYS = [
  "foodAndDrink",
  "billsAndUtilities",
  "car",
  "entertainment",
  "groceries",
  "healthAndWellness",
  "personal",
  "shopping",
  "feesAndAdjustments",
  "others",
  "foster",
  "revenue",
] as const;

type CategoryKey = (typeof CATEGORY_KEYS)[number];

const buildPeriodLabel = (month: number, year: number): string =>
  `${new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })}`;

export async function POST(request: Request) {
  const initTimer = Date.now();
  try {
    if (
      request.headers.get("Authorization") !==
      `Bearer ${process.env.CRON_SECRET}`
    ) {
      return Response.json(
        { message: "Invalid authorization header" },
        { status: 401 }
      );
    }
    console.log("-----------------------------------");
    console.log("------- Request to send weekly report -------");
    console.log("-----------------------------------");

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
      },
      where: {
        accounts: {
          some: {
            NOT: {
              accessToken: undefined,
            },
            AND: {
              user: {
                email: {
                  in: process.env.EMAIL_WHITELIST
                    ? process.env.EMAIL_WHITELIST.split(",")
                    : [],
                },
              },
            },
          },
        },
      },
    });

    if (users.length === 0) {
      return NextResponse.json({ status: 200 });
    }

    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    const periodLabel = buildPeriodLabel(month, year);

    for (const user of users) {
      const report = await prisma.report.findFirst({
        where: {
          userId: user.id,
          month,
          year,
          reportType: ReportType.MONTHLY,
          autoMaintainedAt: { not: null },
        },
      });

      if (!report) {
        console.log(`weekly-report: no draft report for ${user.email} — skipping`);
        continue;
      }

      // Pick only the category columns so non-category fields on Report
      // (id, status, expenses, total, etc.) don't leak into the email.
      const categorySubset = CATEGORY_KEYS.reduce(
        (acc, key) => {
          acc[key] = report[key as CategoryKey] as number;
          return acc;
        },
        {} as Record<CategoryKey, number>
      );
      const breakdown = formatToDefaultCategories(categorySubset);

      await sendWeeklyReportEmail(
        user.email,
        breakdown,
        Math.abs(report.expenses),
        Math.abs(report.revenue),
        periodLabel
      );
    }

    return NextResponse.json({ status: 200 });
  } catch (error) {
    console.log(error);
    return NextResponse.json({ status: 500 });
  } finally {
    console.log(`Time taken: ${Date.now() - initTimer}ms`);
  }
}
