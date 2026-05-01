'use server';

import * as React from "react";
import { Resend } from "resend";
import WeeklyReportEmail, {
  type WeeklyReportCategory,
} from "../emails/WeeklyReportEmail";

type SpendingBreakdown = {
    name: string;
    spending: number;
};

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const reportsUrl = (): string =>
  `${(process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "")}/reports`;

// Caller in src/utils/functions.ts is currently commented out; left as a stub
// so the symbol still exists and can be re-enabled once the connection-update
// React Email component is built.
// export const sendUpdateAccountEmail = async (email: string) => { ... }

export const sendWeeklyReportEmail = async (
    email: string,
    spendingBreakdown: SpendingBreakdown[],
    expenses: number,
    revenue: number,
    periodLabel: string,
  ) => {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      console.error("sendWeeklyReportEmail: missing RESEND_API_KEY or EMAIL_FROM");
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const categories: WeeklyReportCategory[] = spendingBreakdown.map((c) => ({
      name: c.name,
      amountFormatted: fmtMoney(Math.abs(c.spending ?? 0)),
    }));

    console.log("-----------------------------------");
    console.log("------- Sending sendWeeklyReportEmail -------");
    console.log("-----------------------------------");

    try {
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: `Your spending so far — ${periodLabel}`,
        react: React.createElement(WeeklyReportEmail, {
          periodLabel,
          expensesFormatted: fmtMoney(expenses),
          revenueFormatted: fmtMoney(revenue),
          categories,
          reportsUrl: reportsUrl(),
        }),
      });
      if (error) {
        console.error("Resend error:", error);
      }
    } catch (error) {
      console.error(error);
    }
  };
