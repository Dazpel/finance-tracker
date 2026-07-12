"use client";

import { useEffect, useState } from "react";
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
import { appRoutes } from "utils/constants";
import TransactionIcon from "@components/icons/sidebar/currency-dollar";
import { InsightsIcon } from "@components/icons/sidebar/insights-icon";
import { NotesIcon } from "@components/icons/sidebar/notes-icon";
import { ThresholdsIcon } from "@components/icons/sidebar/thresholds-icon";
import { ConnectionHealthIcon } from "@components/icons/sidebar/connection-health-icon";

export const SidebarWrapper = () => {
  const pathname = usePathname();
  const { setTheme, resolvedTheme } = useNextTheme();
  const { sidebarOpen, toggleSidebar } = useSidebarContext();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDarkTheme = resolvedTheme === "dark";

  const handleThemeChange = () => {
    setTheme(isDarkTheme ? "light" : "dark");
  };

  return (
    <aside className="h-full z-[202] shrink-0">
      {sidebarOpen && (
        <div className={Sidebar.Overlay()} onClick={toggleSidebar} />
      )}
      <div
        className={Sidebar({
          collapsed: sidebarOpen,
        })}
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
                isActive={pathname.includes(appRoutes.THRESHOLDS_PAGE)}
                title="Thresholds"
                icon={<ThresholdsIcon />}
                href={appRoutes.THRESHOLDS_PAGE}
              />
              <SidebarItem
                isActive={pathname === appRoutes.NOTES_PAGE}
                title="Notes"
                icon={<NotesIcon />}
                href={appRoutes.NOTES_PAGE}
              />
              <SidebarItem
                isActive={pathname === appRoutes.PLAID_STATUS_PAGE}
                title="Connection Health"
                icon={<ConnectionHealthIcon />}
                href={appRoutes.PLAID_STATUS_PAGE}
                colorStroke
              />
            </SidebarMenu>
          </div>
          <div className={Sidebar.Footer()}>
            <Tooltip content={"Dark mode"} color="primary">
              <div
                className="max-w-fit hover:cursor-pointer"
                onClick={handleThemeChange}
              >
                {mounted && (isDarkTheme ? <SunIcon /> : <MoonIcon />)}
              </div>
            </Tooltip>
          </div>
        </div>
      </div>
    </aside>
  );
};
