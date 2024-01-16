export const appRoutes = {
  ROOT: "/",
  ACCOUNTS_PAGE: "/accounts",
  TRANSACTIONS_PAGE: "/transactions",
  REPORTS_PAGE: "/reports",
  LOGIN_PAGE: "/login",
  RESET_PASSWORD_PAGE: "/reset-password",
  LOG_OUT_PAGE: "/logout",
  DETAILS_PAGE: "/dashboard/details/:whitelistId",
  CREATE_WHITELIST_PAGE: "/dashboard/create",
  BENEFITS_PAGE: "/dashboard/benefits/:whitelistId",
  LOGOS_PAGE: "/dashboard/logos/:whitelistId",
  PUBLISHER_VIEW_PAGE: "/dashboard/publisher-view/:whitelistId",
};

export const defaultCategoryFilterOptions = [
  { name: "Food & Drink", uid: "Food & Drink" },
  { name: "Bills & Utilities", uid: "Bills & Utilities" },
  { name: "Gas", uid: "Gas" },
  { name: "Entertainment", uid: "Entertainment" },
  { name: "Groceries", uid: "Groceries" },
  { name: "Health & Wellness", uid: "Health & Wellness" },
  { name: "Personal", uid: "Personal" },
  { name: "Shopping", uid: "Shopping" },
  { name: "Fees & Adjustments", uid: "Fees & Adjustments" },
  { name: "Others", uid: "Others" },
  { name: "Revenue", uid: "Revenue" },
  { name: "All", uid: "All" },
  { name: "None", uid: "None" },
];

export const defaultCategories = [
  "food & drink",
  "bills & utilities",
  "gas",
  "entertainment",
  "groceries",
  "health & wellness",
  "personal",
  "shopping",
  "fees & adjustments",
  "others",
  "revenue",
];

export const defaultCategorieToValueObject = {
  "food & drink": 0,
  "bills & utilities": 0,
  gas: 0,
  entertainment: 0,
  groceries: 0,
  "health & wellness": 0,
  personal: 0,
  shopping: 0,
  "fees & adjustments": 0,
  others: 0,
  revenue: 0,
};
