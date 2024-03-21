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
import ItemRemoveTable from "@components/ItemRemoveTable/ItemRemoveTable";
import ItemUpdateTable from "@components/ItemUpdateTable.tsx/ItemUpdateTable";

export type AccountType = {
  institutionName: string;
  accounts: AccountBase[];
};

export interface ConnectionType {
  institutionName: string;
  accessToken: string;
};

export type AccountWithErrors = {
  error: string;
} & ConnectionType;

export type AccountsPageProps = {
  accounts: AccountType[];
  success: boolean;
  connections: ConnectionType[];
  accountsWithErrors: AccountWithErrors[];
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

export default function AccountsPage({
  accounts,
  connections,
  success,
  accountsWithErrors
}: AccountsPageProps) {
  const buttonText =
    accounts.length > 0 ? "Link more accounts" : "No accounts linked yet.";

  return (
    <div className="h-full">
      <h3 className="text-xl font-semibold mb-4">Current conected accounts</h3>
      {!success && <p className="mb-4 text-danger">Error fetching data</p>}
      {accounts.length > 0 && (
        <div className="flex flex-col w-full gap-6">
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
          {accountsWithErrors?.length > 0 && <ItemUpdateTable connections={accountsWithErrors} />}
          <ItemRemoveTable connections={connections} />
        </div>
      )}
      <div className="flex flex-col gap-2 mt-4">
        <p>{buttonText}</p>
        <PlaidButton updateMode={accounts.length > 0} />
      </div>
    </div>
  );
}
