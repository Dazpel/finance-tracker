import { ReportData } from "@components/ReportCard/ReportCard";
import { plaidClient } from "@lib/plaid";
import { PlaidAccount } from "@prisma/client";
import { decompressFromEncodedURIComponent } from "lz-string";
import { DateTime } from "next-auth/providers/kakao";
import { Transaction, TransactionBase, TransactionStream } from "plaid";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";

type FormattedTransaction = {
  amount: number;
  category: string[];
  date: string;
  name: string;
  account_id: string;
  transaction_id: string;
  userId: string;
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

export const formatTransactions = (transactions: TransactionBase[], userId: string): FormattedTransaction[] => {
  const formattedTransactions = transactions.map((transaction) => {
    return {
      userId,
      amount: transaction?.amount,
      category: transaction?.category || ["Others"],
      date: transaction?.date,
      name: transaction?.name || transaction?.original_description || "No name",
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

export const formatPlaidTransactions = (transactions: any[], recurring: boolean) => {
  const descriptionToUse = recurring ? "description" : "original_description";
  
  const formattedTransactions = transactions.map((transaction) => {
    const category = transaction.category ? transaction.category[0].replace("and", "&") : "Others";
    const mappedCategory = mapPlaidCategoryToDefaultCategory(category);
    const description = transaction[descriptionToUse] || transaction.name;
    
    return {
      ...transaction,
      category: [mapDefaultCategoryToCustomCategory(description, mappedCategory)],
    };
  });

  if (recurring) {
    const skippedFrequency = ["ANNUALLY"]
    formattedTransactions.filter((transaction: TransactionStream) => transaction.is_active === true && !skippedFrequency.includes(transaction.frequency));
  }

  return formattedTransactions;
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

    const formmattedTransactions = transactions.map((transaction) => {
      const category = transaction.category
        ? transaction.category[0].replace("and", "&")
        : "Others";
      return {
        ...transaction,
        category: [mapPlaidCategoryToDefaultCategory(category)],
      };
    });
    
    transactions = formmattedTransactions;
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
    "Gas": ['chevron', 'shell', 'exxon', 'mobil', 'gas'],
    "Groceries": ['grocery', 'supermarket', 'costco', 'walmart', 'safeway', 'trader', 'joe', 'whole', 'foods', 'instacart', 'winn-dixie'],
    "Food & Drink": ['brew'],
    "Bills & Utilities": ['fpl', 'att', 'at&t', 'xfinity', 'chantilly', 'comcast', 'chatgpt', 'mortgage', 'github'],
    "Revenue": ['unit', 'interest', 'fee', 'reimbursement'],
  };

  const lowerCaseDescription = description.toLowerCase();

  for (const [customCategory, keywords] of Object.entries(categoryMap)) {
    if (keywords.some((key) => lowerCaseDescription.includes(key))) {
      return customCategory;
    }
  }

  return category;
}