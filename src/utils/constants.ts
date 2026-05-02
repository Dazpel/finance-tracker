import { CANONICAL_CATEGORIES } from "@lib/categories";

export const appRoutes = {
  ROOT: "/",
  ACCOUNTS_PAGE: "/accounts",
  TRANSACTIONS_PAGE: "/transactions",
  REPORTS_PAGE: "/reports",
  INSIGHTS_PAGE: "/insights",
  LOGIN_PAGE: "/login",
  LOG_OUT_PAGE: "/logout",
  RECURRING_TRANSACTIONS_PAGE: "/recurring-transactions",
  THRESHOLDS_PAGE: "/thresholds",
  NOTES_PAGE: "/notes",
};

export const defaultCategoryFilterOptions = [
  ...CANONICAL_CATEGORIES.map((c) => ({ name: c, uid: c })),
  { name: "All", uid: "All" },
  { name: "None", uid: "None" },
];

export const defaultFrequencies = [
  "MONTHLY",
  "WEEKLY",
  "BI-MONTHLY",
]

export const plaidCategories = [
  "Transfer",
  "Travel",
  "Tax",
  "Shops",
  "Service",
  "Recreation",
  "Payment",
  "Interest",
  "Healthcare",
  "Community",
  "Bank Fees",
  "Cash advance",
  "Food and drink",
]

export const defaultCategories = [
  "food & drink",
  "bills & utilities",
  "car",
  "entertainment",
  "groceries",
  "health & wellness",
  "personal",
  "shopping",
  "fees & adjustments",
  "others",
  "revenue",
  "foster",
];

export const defaultCategorieToValueObject = {
  "food & drink": 0,
  "bills & utilities": 0,
  car: 0,
  entertainment: 0,
  groceries: 0,
  foster: 0,
  "health & wellness": 0,
  personal: 0,
  shopping: 0,
  "fees & adjustments": 0,
  others: 0,
  revenue: 0,
};

export const LOCAL_ACCOUNT_ID = "new_transaction";

export const fiftyThirtyTwentyCategories = {
  needs: [
    "bills & utilities",
    "groceries",
    "car",
    "health & wellness",
  ],
  wants: [
    "entertainment",
    "food & drink",
    "shopping",
    "personal",
    "others",
    "fees & adjustments",
    "foster",
  ],
};

export const fiftyThirtyTwentyTargets = {
  needs: 50,
  wants: 30,
  savings: 20,
};