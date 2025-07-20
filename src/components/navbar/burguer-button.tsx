import React from "react";
import { useSidebarContext } from "../layout/layout-context";
import { NavbarMenuToggle } from "@heroui/react";

export const BurguerButton = () => {
  const { collapsed, setCollapsed } = useSidebarContext();

  return (
    <NavbarMenuToggle
      onPress={setCollapsed}
      aria-label={collapsed ? "Close menu" : "Open menu"}
    />
  );
};
