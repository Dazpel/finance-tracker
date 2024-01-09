"use client";

import React from "react";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  getKeyValue,
} from "@nextui-org/react";
import { AccountBase } from "plaid";
import { PlaidLink } from "react-plaid-link";
import PlaidButton from "@components/PlaidButton/PlaidButton";

export type AccountsPageProps = {
  accounts: AccountBase[];
  success: boolean;
};

const columns = [
  {
    key: "name",
    label: "NAME",
  },
  {
    key: "type",
    label: "TYPE",
  },
  {
    key: "last4",
    label: "LAST 4",
  },
];

const rows = (accounts: AccountBase[]) => {
  return accounts.map((account) => ({
    key: account.account_id,
    name: account.name,
    type: account.subtype,
    last4: account.mask,
  }));
};

const handleAccountLinkage = async () => {
  console.log("Link accounts");
  const response = await fetch("/api/plaid/link");
  console.log(response);
};

export default function AccountsPage({ accounts, success }: AccountsPageProps) {
  return (
    <div className="h-full">
      <h3 className="text-xl font-semibold mb-4">Current conected accounts</h3>
      {!success && <p className="mb-4 text-danger">Error fetching data</p>}
      {accounts.length > 0 ? (
        <Table aria-label="Accounts linked table">
          <TableHeader columns={columns}>
            {(column) => (
              <TableColumn key={column.key}>{column.label}</TableColumn>
            )}
          </TableHeader>
          <TableBody
            items={rows(accounts)}
            emptyContent="No accounts linked yet."
          >
            {(item) => (
              <TableRow key={item.key}>
                {(columnKey) => (
                  <TableCell>{getKeyValue(item, columnKey)}</TableCell>
                )}
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        <div className="flex flex-col gap-2">
          <p>No accounts linked yet.</p>
          <PlaidButton />
        </div>
      )}
    </div>
  );
}
