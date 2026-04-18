import React from "react";
import { useSidebarContext } from "../layout/layout-context";
import { NavbarMenuToggle } from "@heroui/react";

export const BurguerButton = () => {
  const { sidebarOpen, toggleSidebar } = useSidebarContext();

  return (
    <NavbarMenuToggle
      onPress={toggleSidebar}
      aria-label={sidebarOpen ? "Close menu" : "Open menu"}
    />
  );
};
