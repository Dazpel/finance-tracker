"use client";

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  getKeyValue,
} from "@nextui-org/react";
import { AccountBase } from "plaid";
import PlaidButton from "@components/PlaidButton/PlaidButton";

export type AccountType = {
  institutionName: string;
  accounts: AccountBase[];
};

export type AccountsPageProps = {
  accounts: AccountType[];
  success: boolean;
};

const columns = [
  {
    key: "institutionName",
    label: "INSTITUTION",
  },
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

const rows = (entries: AccountType[]) => {
  let rows = [];
  for (const entry of entries) {
    for (const account of entry.accounts) {
      rows.push({
        key: account.account_id,
        institutionName: entry.institutionName,
        name: account.name,
        type: account.type,
        last4: account.mask,
      });
    }
  }
  return rows;
};

export default function AccountsPage({ accounts, success }: AccountsPageProps) {
  const buttonText =
    accounts.length > 0 ? "Link more accounts" : "No accounts linked yet.";

  return (
    <div className="h-full">
      <h3 className="text-xl font-semibold mb-4">Current conected accounts</h3>
      {!success && <p className="mb-4 text-danger">Error fetching data</p>}
      {accounts.length > 0 && (
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
      )}
      <div className="flex flex-col gap-2 mt-4">
        <p>{buttonText}</p>
        <PlaidButton updateMode={accounts.length > 0} />
      </div>
    </div>
  );
}
