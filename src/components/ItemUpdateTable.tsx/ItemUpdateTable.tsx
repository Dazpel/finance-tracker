"use client";

import React, { useCallback, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { AccountWithErrors, ConnectionType } from "app/accounts/AccountsPage";
import PlaidButton from "@components/PlaidButton/PlaidButton";

type TableRow = {
  key: string;
  institutionName: string;
};

type ItemRemoveTableProps = {
  connections: AccountWithErrors[];
};

const columns = [
  {
    key: "institutionName",
    label: "INSTITUTION",
  },
  {
    key: "actions",
    label: "ACTIONS",
  },
];

const rows = (entries: AccountWithErrors[]) => {
  let rows = [];
  for (const entry of entries) {
    rows.push({
      key: entry.accessToken,
      institutionName: entry.institutionName,
    });
  }
  return rows;
};

export default function ItemUpdateTable({ connections }: ItemRemoveTableProps) {
  const router = useRouter();
  const [error, setError] = useState(false);

  const renderCell = useCallback(
    (connection: TableRow, columnKey: React.Key) => {
      switch (columnKey) {
        case "actions":
          return (
            <PlaidButton
              updateMode
              accessToken={connection.key}
              buttonText="Update connection"
            />
          );
        default:
          return connection.institutionName;
      }
    },
    []
  );

  return (
    <div className="h-full">
      <h3 className="text-l font-semibold mb-2">Update connections</h3>
      <p className="mb-2">
        The following accounts need to be updated to be used again
      </p>
      {error && <p className="mb-4 text-danger">Error updating connection</p>}
      <Table aria-label="Connections table">
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn key={column.key}>{column.label}</TableColumn>
          )}
        </TableHeader>
        <TableBody
          items={rows(connections)}
          emptyContent="No Connections linked yet."
        >
          {(item) => (
            <TableRow key={item.key}>
              {(columnKey) => (
                <TableCell>{renderCell(item, columnKey)}</TableCell>
              )}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
