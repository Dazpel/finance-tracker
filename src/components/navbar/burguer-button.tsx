import React from "react";
import { useSidebarContext } from "../layout/layout-context";
import { StyledBurgerButton } from "./navbar.styles";
import { NavbarMenuToggle } from "@nextui-org/react";

export const BurguerButton = () => {
  const { collapsed, setCollapsed } = useSidebarContext();

  return (
    <NavbarMenuToggle
      onPress={setCollapsed}
      aria-label={collapsed ? "Close menu" : "Open menu"}
    />
  );
};
