import { appRoutes } from "utils/constants";
import type { QuickLink } from "./types";

/** "Jump back in" tiles — the deep pages Home routes into. */
export const QUICK_LINKS: QuickLink[] = [
  {
    label: "Insights",
    description: "Category trends & 50/30/20",
    href: appRoutes.INSIGHTS_PAGE,
    icon: "📊",
  },
  {
    label: "Reports",
    description: "Monthly & annual rollups",
    href: appRoutes.REPORTS_PAGE,
    icon: "🧾",
  },
  {
    label: "Accounts",
    description: "Balances & connections",
    href: appRoutes.ACCOUNTS_PAGE,
    icon: "🏦",
  },
  {
    label: "Recurring",
    description: "Subscriptions & bills",
    href: appRoutes.RECURRING_TRANSACTIONS_PAGE,
    icon: "🔁",
  },
];
