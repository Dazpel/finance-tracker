"use client";

import React from "react";
import { Sidebar } from "./sidebar.styles";
import { Tooltip } from "@heroui/react";
import { HomeIcon } from "@components/icons/sidebar/home-icon";
import { PaymentsIcon } from "@components/icons/sidebar/payments-icon";
import { AccountsIcon } from "@components/icons/sidebar/accounts-icon";
import { SidebarItem } from "./sidebar-item";
import { SidebarMenu } from "./sidebar-menu";
import { useSidebarContext } from "../layout/layout-context";
import { usePathname } from "next/navigation";
import { SunIcon } from "@components/icons/sidebar/SunIcon";
import { useTheme as useNextTheme } from "next-themes";
import { MoonIcon } from "@components/icons/sidebar/MoonIcon";
import { useIsSSR } from "@react-aria/ssr";
import { appRoutes } from "utils/constants";
import TransactionIcon from "@components/icons/sidebar/currency-dollar";
import { RecurringPaymentsIcon } from "@components/icons/sidebar/recurring-payments-icon";
import { InsightsIcon } from "@components/icons/sidebar/insights-icon";

export const SidebarWrapper = () => {
  const pathname = usePathname();
  const { setTheme, theme } = useNextTheme();
  const isSSR = useIsSSR();
  const { collapsed } = useSidebarContext();
  const isDarkTheme = theme === "dark" ? true : false;

  const handleThemeChange = () => {
    setTheme(isDarkTheme ? "light" : "dark");
  };

  return (
    <aside className="h-screen z-[202] sticky top-0">
      <div
        className={`${Sidebar({
          collapsed: collapsed,
        })} ${!collapsed && "static"}`}
      >
        <div className="flex flex-col justify-between h-full">
          <div className={Sidebar.Body()}>
            <SidebarItem
              title="Home"
              icon={<HomeIcon />}
              isActive={pathname === appRoutes.ROOT}
              href={appRoutes.ROOT}
            />
            <SidebarMenu title="Main Menu">
              <SidebarItem
                isActive={pathname === appRoutes.ACCOUNTS_PAGE}
                title="Accounts"
                icon={<AccountsIcon />}
                href={appRoutes.ACCOUNTS_PAGE}
              />
              <SidebarItem
                isActive={pathname === appRoutes.TRANSACTIONS_PAGE}
                title="Transactions"
                icon={<TransactionIcon />}
                href={appRoutes.TRANSACTIONS_PAGE}
                colorStroke
              />
              <SidebarItem
                isActive={pathname.includes(appRoutes.REPORTS_PAGE)}
                title="Reports"
                icon={<PaymentsIcon />}
                href={appRoutes.REPORTS_PAGE}
              />
              <SidebarItem
                isActive={pathname.includes(appRoutes.INSIGHTS_PAGE)}
                title="Insights"
                icon={<InsightsIcon />}
                href={appRoutes.INSIGHTS_PAGE}
              />
              <SidebarItem
                isActive={pathname.includes(appRoutes.RECURRING_TRANSACTIONS_PAGE)}
                title="Recurring"
                icon={<RecurringPaymentsIcon />}
                href={appRoutes.RECURRING_TRANSACTIONS_PAGE}
              />
            </SidebarMenu>
          </div>
          <div className={Sidebar.Footer()}>
            <Tooltip content={"Dark mode"} color="primary">
              <div
                className="max-w-fit hover:cursor-pointer"
                onClick={handleThemeChange}
              >
                {isDarkTheme || isSSR ? <SunIcon /> : <MoonIcon />}
              </div>
            </Tooltip>
          </div>
        </div>
      </div>
    </aside>
  );
};
