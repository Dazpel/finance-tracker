"use client";

import React, { useCallback, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Chip,
} from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { AccountWithErrors, ConnectionType } from "app/accounts/AccountsPage";
import PlaidButton from "@components/PlaidButton/PlaidButton";
import { useToast } from "../../hooks/useToast";

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
    key: "status",
    label: "STATUS",
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
  const queryClient = useQueryClient();
  const { successToast } = useToast();

  const handleUpdateSuccess = useCallback(async () => {
    successToast("Bank connection updated successfully!");
    // Invalidate queries to refresh data
    await queryClient.invalidateQueries({ queryKey: ['accountsData'] });
  }, [queryClient, successToast]);

  const renderCell = useCallback(
    (connection: TableRow, columnKey: React.Key) => {
      switch (columnKey) {
        case "status":
          return (
            <Chip 
              color="warning"
              variant="flat"
              size="sm"
            >
              Needs Update
            </Chip>
          );
        case "actions":
          return (
            <PlaidButton
              updateMode
              accessToken={connection.key}
              buttonText="Update"
              variant="update"
              size="sm"
              onSuccessCallback={handleUpdateSuccess}
            />
          );
        case "institutionName":
          return (
            <div className="flex items-center gap-2">
              <span>{connection.institutionName}</span>
            </div>
          );
        default:
          return connection.institutionName;
      }
    },
    [handleUpdateSuccess]
  );

  return (
    <div className="h-full">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Update connections</h3>
        <p className="text-sm text-gray-600">
          The following bank connections need to be updated to continue working properly
        </p>
      </div>
      
      <Table 
        aria-label="Bank connections that need updates"
        className="min-h-[200px]"
      >
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn key={column.key}>{column.label}</TableColumn>
          )}
        </TableHeader>
        <TableBody
          items={rows(connections)}
          emptyContent="All bank connections are up to date."
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
      
      {connections.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>All your bank connections are working properly!</p>
          <p className="text-sm mt-2">No updates needed at this time.</p>
        </div>
      )}
    </div>
  );
}
