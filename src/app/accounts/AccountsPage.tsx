"use client";

import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  getKeyValue,
} from "@heroui/react";
import { AccountBase } from "plaid";
import PlaidButton from "@components/PlaidButton/PlaidButton";
import ItemRemoveTable from "@components/ItemRemoveTable/ItemRemoveTable";
import ItemUpdateTable from "@components/ItemUpdateTable.tsx/ItemUpdateTable";
import { useQuery } from "@tanstack/react-query";
import PageLoader from "@components/PageLoader/PageLoader";

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

export default function AccountsPage() {
  const [error, setError] = useState(false);
  const { 
    isFetching, 
    isLoading, 
    isError: queryError, 
    data: accountsData,
    refetch: refetchAccounts 
  } = useQuery({
    queryKey: ['accountsData'],
    queryFn: async () => {
      const response = await fetch('/api/accounts/getAccounts')
      const data = await response?.json()

      if (data.success) {
        return data.response as AccountsPageProps;
      }
      
      setError(true);
      return { accounts: [], connections: [], accountsWithErrors: [] };
    },
    initialData: { accounts: [], connections: [], accountsWithErrors: [] }
  })
  
  if (isFetching || isLoading) {
    return <PageLoader />
  }

  const onPlaidSuccess = async () => {
    // Refetch accounts data to update the UI without page reload
    await refetchAccounts();
  }
  
  const buttonText = accountsData?.accounts.length > 0 ? "Link more accounts" : "No accounts linked yet.";
  
  return (
    <div className="h-inherit">
      {(queryError || error) && <p className="mb-4 text-danger">Error fetching data, please try again.</p>}
      {accountsData?.accounts?.length > 0 && (
        <div className="flex flex-col w-full gap-6">
          <Table aria-label="Accounts linked table">
            <TableHeader columns={columns}>
              {(column) => (
                <TableColumn key={column.key}>{column.label}</TableColumn>
              )}
            </TableHeader>
            <TableBody
              items={rows(accountsData?.accounts)}
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
          {accountsData.accountsWithErrors?.length > 0 && <ItemUpdateTable connections={accountsData.accountsWithErrors} />}
          <ItemRemoveTable connections={accountsData.connections} />
        </div>
      )}
      {
        !queryError && !error && (
        <div className="flex flex-col gap-2 mt-4">
          <p>{buttonText}</p>
          <PlaidButton onSuccessCallback={onPlaidSuccess} />
        </div>
        )
      }
    </div>
  );
}
