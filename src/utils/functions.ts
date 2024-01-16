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