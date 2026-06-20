// Server-only transaction helpers. These pull in the Plaid client and NextAuth
// session (which transitively load the Prisma client / Node built-ins), so they
// MUST NOT be imported from client components. They were split out of
// src/utils/functions.ts so that file stays client-safe: under Prisma v7 the
// generated client has top-level Node side-effects that defeat tree-shaking, so
// any client component transitively importing it breaks the browser bundle.
import { plaidClient } from "@lib/plaid";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import { PlaidAccount } from "@generated/prisma/browser";
import { Transaction } from "plaid";
import { formatPlaidTransactions, isDateBeforeToday } from "./functions";

type FetchTransactionsResponse = {
  success: boolean;
  transactions: Transaction[];
};

// Plaid's per-request page cap for /transactions/get.
const TRANSACTIONS_PAGE_SIZE = 500;

export const refreshUserTransactions = async (
  accounts: PlaidAccount[],
): Promise<boolean> => {
  console.log("--------Refreshing transactions--------");
  let success = true;
  if (accounts && accounts.length > 0) {
    await Promise.all(
      accounts.map(async (account) => {
        const response = await plaidClient.itemGet({
          access_token: account.accessToken || "",
        });

        const lastSuccessfulUpdate = new Date(
          response.data.status?.transactions?.last_successful_update as string,
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
              return;
            }
          }
        }
      }),
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
  accounts: PlaidAccount[],
): Promise<FetchTransactionsResponse> => {
  console.log("--------Fetching transactions--------");
  let transactions: Transaction[] = [];
  let success = true;

  try {
    await Promise.all(
      accounts.map(async (account) => {
        // Paginate into a per-account buffer: Plaid's `offset` and
        // `total_transactions` are scoped to a single access token, and the
        // accounts here fetch concurrently into the shared array. Tracking
        // progress per account keeps offsets correct and avoids one account's
        // pushes terminating another's loop early (or duplicating pages).
        const accountTransactions: Transaction[] = [];
        let totalTransactions = 0;

        do {
          const response = await plaidClient.transactionsGet({
            access_token: account.accessToken || "",
            start_date: startDate,
            end_date: endDate,
            options: {
              offset: accountTransactions.length,
              include_original_description: true,
              count: TRANSACTIONS_PAGE_SIZE,
            },
          });

          const page = response.data.transactions;
          accountTransactions.push(...page);
          totalTransactions = response.data.total_transactions;

          // Defensive stop: if Plaid returns an empty page while we're still
          // below the reported total (item mid-sync, or offset past the rows
          // currently available), bail instead of re-requesting forever.
          if (page.length === 0) break;
        } while (accountTransactions.length < totalTransactions);

        transactions.push(...accountTransactions);
      }),
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
