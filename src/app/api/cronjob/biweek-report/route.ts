import { NextResponse } from "next/server";
import prisma from "@lib/prisma/prismaClient";
import { fetchUserTransactions, formatToDefaultCategories, getBiweekRange, refreshUserTransactions } from "utils/functions";
import { defaultCategorieToValueObject } from "utils/constants";
import { sendBiweekReportEmail } from "utils/emailTemplates";

export const maxDuration = 20;

export async function POST(request: Request) {
    const initTimer = Date.now();
  try {
    if (
      request.headers.get("Authorization") !==
      `Bearer ${process.env.CRON_SECRET}`
    ) {
      return Response.json(
        { message: "Invalid authorization header" },
        { status: 200 }
      );
    }
    console.log("-----------------------------------");
    console.log("------- Request to create bi-weekly report -------");
    console.log("-----------------------------------");

    const users = await prisma.user.findMany({
      select: {
        email: true,
        accounts: true,
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
    
    const { startDate, endDate } = getBiweekRange();

    if (users.length > 0) {
        users.forEach(async (user) => {
            const accounts = user.accounts;
            let report = { ...defaultCategorieToValueObject };
            let totalExpenses = 0;
            const refreshSuccess = accounts.length > 0 ? await refreshUserTransactions(accounts, user.email) : false;
            if (refreshSuccess) {
                const response = await fetchUserTransactions(startDate, endDate, accounts);
                if (response.success) {
                    // Format transactions to default categories
                    response.transactions.map((transaction) => {
                        const category = (transaction?.category && transaction?.category[0])?.toLocaleLowerCase() || "others";
                        report[category as keyof typeof report] = report[category as keyof typeof report] + transaction.amount || transaction.amount;
                        if (category !== "revenue") {
                            totalExpenses += transaction?.amount || 0;
                          }
                    });
                    // Format to 2 decimal places
                    for (const [key, value] of Object.entries(report)) {
                        if (key === "revenue") {
                            report[key as keyof typeof report] = Number(Math.abs(value).toFixed(2));
                        } else {
                            report[key as keyof typeof report] = Number(value.toFixed(2));
                        }
                    }
                    totalExpenses = -Number(Math.abs(totalExpenses).toFixed(2));

                    const { revenue, ...categories } = report;
                    const formattedReport = formatToDefaultCategories(categories);
                    console.log("--------Sending Report Breakdown--------");

                       await sendBiweekReportEmail(
                        user.email,
                        formattedReport,
                        Math.abs(totalExpenses),
                        Math.abs(revenue)
                      );
                }
            }
        })
    }

    return NextResponse.json({ status: 200 });
  } catch (error) {
    console.log(error);
    return NextResponse.json({ status: 500 });
  } finally {
    console.log(`Time taken: ${Date.now() - initTimer}ms`);
  }
}
