import {
  Avatar,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  NavbarItem,
} from "@heroui/react";
import React, { Key } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export const UserDropdown = () => {
  const session = useSession();
  const router = useRouter();
  const handleDropdownSelect = async (actionKey: Key): Promise<void> => {
    switch (actionKey) {
      case "logout":
        await signOut();
        break;
      default:
        break;
    }
  };
  return (
    <Dropdown>
      <NavbarItem>
        <DropdownTrigger>
          <Avatar
            as="button"
            color="secondary"
            size="md"
            src="https://i.pravatar.cc/150?u=a042581f4e29026704d"
          />
        </DropdownTrigger>
      </NavbarItem>
      <DropdownMenu
        aria-label="User menu actions"
        onAction={handleDropdownSelect}
      >
        <DropdownItem
          key="profile"
          className="flex flex-col justify-start w-full items-start"
        >
          <p>Signed in as</p>
          <p>{session?.data?.user?.email}</p>
        </DropdownItem>
        <DropdownItem key="logout" color="danger" className="text-danger ">
          Log Out
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
};
