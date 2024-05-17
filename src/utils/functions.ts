import { ReportData } from "@components/ReportCard/ReportCard";
import { decompressFromEncodedURIComponent } from "lz-string";
import { DateTime } from "next-auth/providers/kakao";
import { TransactionBase } from "plaid";

type FormattedTransaction = {
  amount: number;
  category: string[];
  date: string;
  name: string;
  account_id: string;
  transaction_id: string;
  userId: string;
};

export const formatDate = (date: Date) => {
  let month = "" + (date.getMonth() + 1), // Months are zero indexed
    day = "" + date.getDate(),
    year = date.getFullYear();

  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;

  return [year, month, day].join("-");
};

export const formatTransactions = (transactions: TransactionBase[], userId: string): FormattedTransaction[] => {
  const formattedTransactions = transactions.map((transaction) => {
    return {
      userId,
      amount: transaction?.amount,
      category: transaction?.category || ["Others"],
      date: transaction?.date,
      name: transaction?.name || "No name",
      account_id: transaction.account_id,
      transaction_id: transaction.transaction_id
    };
  });

  return formattedTransactions;
}

export const formatReportKeys = (report: ReportData) => {
  const {
    ["food & drink"]: a,
    ["bills & utilities"]: b,
    ["health & wellness"]: c,
    ["fees & adjustments"]: d,
    ...otherKeys
  } = report;

  const formattedReport = {
    ...otherKeys,
    foodAndDrink: a,
    billsAndUtilities: b,
    healthAndWellness: c,
    feesAndAdjustments: d,
    revenue: Math.abs(report.revenue),
  };

  return formattedReport;
};

export const decodeQueryString = (queryString: string) => {
  const formattedString = queryString.replace(" ", "+");
  return JSON.parse(decompressFromEncodedURIComponent(formattedString));
}

export const formatCreatedDate = (date: DateTime): string => {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const isDateBeforeToday = (date: Date) => {
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const dateUTC = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return dateUTC < todayUTC;
};

export const convertToCSV = (data: any) => {
  const headers = ['amount', 'category', 'date', 'name'];
  const csvRows = [];

  // Add headers
  csvRows.push(headers.join(','));

  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      const formattedValue = Array.isArray(value) ? value.join(', ') : value;
      const escaped = ('' + formattedValue).replace(/"/g, '\\"');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}