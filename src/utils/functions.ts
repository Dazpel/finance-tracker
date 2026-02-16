import { ReportData } from "@components/ReportCard/ReportCard";
import { plaidClient } from "@lib/plaid";
import { PlaidAccount } from "@prisma/client";
import { decompressFromEncodedURIComponent } from "lz-string";
import { DateTime } from "next-auth/providers/kakao";
import { Transaction, TransactionStream } from "plaid";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import { TransactionWithNotes } from "./types";

type FormattedTransaction = {
  amount: number;
  category: string[];
  date: string;
  name: string;
  account_id: string;
  transaction_id: string;
  userId: string;
  notes?: string; // Optional notes field for transactions
};

type FetchTransactionsResponse = {
  success: boolean;
  transactions: Transaction[];
};

export const getBiweekRange = () => {
  let month = "" + (new Date().getMonth() + 1)
  let currentMonth = month.length < 2 ? `0${month}` : month;
  const startDate = `${new Date().getFullYear()}-${currentMonth}-01`;
  const endDate = `${new Date().getFullYear()}-${currentMonth}-15`;

  return { startDate, endDate };
}

export const formatDate = (date: Date) => {
  let month = "" + (date.getMonth() + 1), // Months are zero indexed
    day = "" + date.getDate(),
    year = date.getFullYear();

  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;

  return [year, month, day].join("-");
};

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const US_DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * Normalizes date strings to canonical YYYY-MM-DD for consistent sorting.
 * Supports YYYY-MM-DD (pass-through) and MM/DD/YYYY (converted).
 * Returns original string if unrecognized (comparison will still work via getDateSortKey).
 */
export const normalizeDateString = (dateStr: string): string => {
  if (!dateStr || typeof dateStr !== "string") return dateStr;
  const trimmed = dateStr.trim();
  if (ISO_DATE_REGEX.test(trimmed)) return trimmed;
  const usMatch = trimmed.match(US_DATE_REGEX);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    const m = month.padStart(2, "0");
    const d = day.padStart(2, "0");
    return `${year}-${m}-${d}`;
  }
  return trimmed;
};

/**
 * Returns a numeric key for safe chronological comparison (higher = later).
 * Uses normalized YYYY-MM-DD when possible so string order matches date order.
 */
export const getDateSortKey = (dateStr: string): number => {
  const normalized = normalizeDateString(dateStr);
  const parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

/**
 * Sorts transactions by date descending (newest first / 31st to 1st).
 * Uses shared normalization so mixed formats (YYYY-MM-DD, MM/DD/YYYY) order correctly.
 */
export const sortTransactionsByDateDesc = <T extends { date: string }>(
  transactions: T[]
): T[] => {
  return [...transactions].sort(
    (a, b) => getDateSortKey(b.date) - getDateSortKey(a.date)
  );
};

export const formatRecurringTransactions = (transactions: TransactionStream[], userId: string) => {
  const formattedTransactions = transactions.map((transaction) => {
    return {
      userId,
      amount: transaction?.last_amount?.amount,
      frequency: transaction?.frequency,
      last_date: transaction?.last_date,
      description: transaction?.description || "No name",
      account_id: transaction.account_id,
      stream_id: transaction.stream_id,
    };
  });

  return formattedTransactions;
}

export const formatTransactions = (transactions: TransactionWithNotes[], userId: string): FormattedTransaction[] => {
  const formattedTransactions = transactions.map((transaction) => {
    return {
      userId,
      amount: transaction?.amount,
      category: transaction?.category || ["Others"],
      date: transaction?.date,
      name: transaction?.name || transaction?.original_description || "No name",
      account_id: transaction.account_id,
      transaction_id: transaction.transaction_id,
      notes: transaction?.notes,
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

const matchFrequencyAmountToMonthly = (frequency: string, amount: number) => {
  let response = {
    amount,
    frequency,
  }

  switch (frequency) {
    case "WEEKLY":
      response.amount = amount * 52 / 12;
      response.frequency = "MONTHLY";
      break;
    case "SEMI_MONTHLY":
    case "BI-WEEKLY":
      response.amount = amount * 2;
      response.frequency = "MONTHLY";
      break;
    case "ANNUALLY":
      response.amount = amount / 12;
      response.frequency = "MONTHLY";
      break;
  }

  return response;
}

export const formatPlaidTransactions = (transactions: any[], recurring: boolean) => {
  const descriptionToUse = recurring ? "description" : "original_description";
  let response = [];
  
    response = transactions.map((transaction) => {
    const category = transaction.category ? transaction.category[0].replace("and", "&") : "Others";
    const mappedCategory = mapPlaidCategoryToDefaultCategory(category);
    const description = transaction[descriptionToUse] || transaction.name;
    const defaultResponse = {
      ...transaction,
      category: [mapDefaultCategoryToCustomCategory(description, mappedCategory)],
    };

    if (recurring) {
      const { last_amount: { amount }, frequency } = transaction;
      const { amount: newAmount, frequency: newFrequency } = matchFrequencyAmountToMonthly(frequency, Math.abs(amount));

      return {
        ...defaultResponse,
        frequency: newFrequency,
        last_amount: { amount: newAmount },
      }
    }
    
    return defaultResponse;
  });

  if (recurring) {
    const skippedFrequency = ["ANNUALLY"]
    return response.filter((transaction: TransactionStream) => transaction.is_active === true && !skippedFrequency.includes(transaction.frequency));
  }

  return response;
}

export const mapPlaidCategoryToDefaultCategory = (category: string) => {
  switch (category) {
    case "Shops":
      return "Shopping";
    case "Bank Fees":
      return "Fees & Adjustments";
    case "Service":
    case "Payment":
      return "Bills & Utilities";
    case "Travel":
      return "Entertainment";
    case "Transfer":
    case "Interest":
      return "Revenue";
    case "Recreation":
      return "Health & Wellness";
    default:
    return category;
  }
}

export const formatToDefaultCategories = (report: ReportData) => {
  const categories = [];
  const {
    foodAndDrink,
    billsAndUtilities,
    healthAndWellness,
    feesAndAdjustments,
    revenue,
    ...otherKeys
  } = report;

  const formattedReport = {
    ["food & drink"]: foodAndDrink,
    ["bills & utilities"]: billsAndUtilities,
    ["health & wellness"]: healthAndWellness,
    ["fees & adjustments"]: feesAndAdjustments,
    ...otherKeys,
  };

  for (const [key, value] of Object.entries(formattedReport)) {
    categories.push({ name: key, spending: value });
  }

  return categories;
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

export const refreshUserTransactions = async (accounts: PlaidAccount[], userEmail: string): Promise<Boolean> => {
  console.log("--------Refreshing transactions--------");
  let success = true;
  if (accounts && accounts.length > 0) {
    await Promise.all(
      accounts.map(async (account) => {
        const response = await plaidClient.itemGet({
          access_token: account.accessToken || "",
        });
        
        const lastSuccessfulUpdate = new Date(
          response.data.status?.transactions?.last_successful_update as string
          );

        if (isDateBeforeToday(lastSuccessfulUpdate)) {
          try {
            await plaidClient.transactionsRefresh({
              access_token: account.accessToken || "",
            });
          } catch (error: any) {
            console.error("Error refreshing transactions", error);
            const errorCode = error?.response?.data?.error_code;

            if (errorCode === "ITEM_LOGIN_REQUIRED") {
              console.error("Item login required");
              success = false;
              // await sendUpdateAccountEmail(userEmail);
              return;
            }
          }
        }
      })
    );
  }
  if (!success) {
    console.error("Failed to refresh transactions");
  } else {
    console.log("--------Transactions refreshed--------");
  }
  return success;
};

export const fetchUserTransactions = async (
  startDate: string,
  endDate: string,
  accounts: PlaidAccount[]
): Promise<FetchTransactionsResponse> => {
  console.log("--------Fetching transactions--------");
  let transactions: Transaction[] = [];
  let success = true;

  try {
    await Promise.all(
      accounts.map(async (account) => {
        let offset = 0;
        let totalTransactions = 0;

        do {
          const response = await plaidClient.transactionsGet({
            access_token: account.accessToken || "",
            start_date: startDate,
            end_date: endDate,
            options: { offset, include_original_description: true, count: 500 },
          });

          transactions.push(...response.data.transactions);
          totalTransactions = response.data.total_transactions;
          offset = transactions.length;
        } while (transactions.length < totalTransactions);
      })
    );

    transactions = formatPlaidTransactions(transactions, false);
  } catch (error) {
    console.error(error);
    success = false;
  }
  console.log("--------Transactions fetched--------");
  return { success, transactions };
};

export async function getAccessToken(): Promise<boolean> {
  const session = await getServerSession(options);
  const accounts = session?.user?.accounts || [];
  const isAccessTokenValid = accounts?.length > 0 || false;
  
  return isAccessTokenValid;
}

export function mapDefaultCategoryToCustomCategory(description: string, category: string): string {
  const categoryMap: { [key: string]: string[] } = {
    "Car": ['chevron', 'shell', 'exxon', 'mobil', 'gas', 'tire', 'oil', 'maintenance', 'insurance', 'auto', 'vehicle'],
    "Groceries": ['grocery', 'supermarket', 'costco', 'walmart', 'safeway', 'trader', 'joe', 'whole', 'foods', 'instacart', 'winn-dixie','ic'],
    "Food & Drink": ['brew'],
    "Bills & Utilities": ['fpl', 'att', 'at&t', 'xfinity', 'chantilly', 'comcast', 'chatgpt', 'mortgage', 'github', 'cooper'],
    "Revenue": ['unit', 'interest', 'fee', 'reimbursement'],
    "Entertainment": ["amc", "ticket", "movie"],
  };

  const lowerCaseDescription = description.toLowerCase();

  for (const [customCategory, keywords] of Object.entries(categoryMap)) {
    if (keywords.some((key) => lowerCaseDescription.includes(key))) {
      return customCategory;
    }
  }

  return category;
}

export const filterTransactions = (childReports: any[]) => {
  let transactions: Transaction[] = []
  childReports.forEach((report) => {
    transactions = transactions.concat(report.transactions as Transaction[]);
  })
  return transactions;
}