"use client";

import React, { useCallback, useState } from "react";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@nextui-org/react";
import { useRouter } from "next/navigation";
import { ConnectionType } from "app/accounts/AccountsPage";

type TableRow = {
  key: string;
  institutionName: string;
};

type ItemRemoveTableProps = {
  connections: ConnectionType[];
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

const rows = (entries: ConnectionType[]) => {
  let rows = [];
  for (const entry of entries) {
    rows.push({
      key: entry.accessToken,
      institutionName: entry.institutionName,
    });
  }
  return rows;
};

export default function ItemRemoveTable({ connections }: ItemRemoveTableProps) {
  const router = useRouter();
  const [error, setError] = useState(false);

  const renderCell = useCallback(
    (connection: TableRow, columnKey: React.Key) => {
      const removeConnection = async (accessToken: string) => {
        setError(false);
        const res = await fetch("/api/plaid/removeItem", {
          method: "POST",
          body: JSON.stringify({ accessToken }),
        });
        const data = await res.json();
        if (data?.success) {
          router.refresh();
        } else {
          setError(true);
        }
      };

      const itemId = connection.key;
      switch (columnKey) {
        case "actions":
          return (
            <Button
              color="danger"
              className="w-fit"
              onClick={() => removeConnection(itemId)}
            >
              Remove connection
            </Button>
          );
        default:
          return connection.institutionName;
      }
    },
    [router]
  );

  return (
    <div className="h-full">
        <h3 className="text-l font-semibold mb-2">Remove connections</h3>
        {error && <p className="mb-4 text-danger">Error removing connection</p>}
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
