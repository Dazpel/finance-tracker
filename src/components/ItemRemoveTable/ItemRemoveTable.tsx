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
  Tooltip,
  Chip,
} from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { ConnectionType } from "app/accounts/AccountsPage";
import { useToast } from "../../hooks/useToast";

type TableRow = {
  key: string;
  institutionName: string;
  isRemoving?: boolean;
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
    key: "status",
    label: "STATUS",
  },
  {
    key: "actions",
    label: "ACTIONS",
  },
];

const rows = (entries: ConnectionType[], removingItems: Set<string>) => {
  let rows = [];
  for (const entry of entries) {
    rows.push({
      key: entry.accessToken,
      institutionName: entry.institutionName,
      isRemoving: removingItems.has(entry.accessToken),
    });
  }
  return rows;
};

export default function ItemRemoveTable({ connections }: ItemRemoveTableProps) {
  const queryClient = useQueryClient();
  const { successToast, errorToast } = useToast();
  const [removingItems, setRemovingItems] = useState<Set<string>>(new Set());

  const removeConnection = useCallback(async (accessToken: string) => {
    // Add to removing items set to show loading state
    setRemovingItems(prev => new Set(prev).add(accessToken));
    
    try {
      const response = await fetch("/api/plaid/removeItem", {
        method: "POST",
        body: JSON.stringify({ accessToken }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data?.success) {
        successToast("Bank connection removed successfully!");
        
        // Invalidate queries to refresh data
        await queryClient.invalidateQueries({ queryKey: ['accountsData'] });
      } else {
        throw new Error(data?.error || "Failed to remove connection");
      }
    } catch (error) {
      console.error("Error removing connection:", error);
      errorToast(error instanceof Error ? error.message : "Failed to remove connection. Please try again.");
    } finally {
      // Remove from removing items set
      setRemovingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(accessToken);
        return newSet;
      });
    }
  }, [queryClient, successToast, errorToast]);

  const renderCell = useCallback(
    (connection: TableRow, columnKey: React.Key) => {

      const itemId = connection.key;
      const isRemoving = connection.isRemoving;
      
      switch (columnKey) {
        case "status":
          return (
            <Chip 
              color={isRemoving ? "warning" : "success"}
              variant="flat"
              size="sm"
            >
              {isRemoving ? "Removing..." : "Connected"}
            </Chip>
          );
        case "actions":
          return (
            <Tooltip 
              content={isRemoving ? "Removing connection..." : "Remove this bank connection"}
              placement="top"
            >
              <Button
                color="danger"
                variant="flat"
                size="sm"
                className="w-fit"
                onPress={() => removeConnection(itemId)}
                isDisabled={isRemoving}
                isLoading={isRemoving}
              >
                {isRemoving ? "Removing..." : "Remove"}
              </Button>
            </Tooltip>
          );
        case "institutionName":
          return (
            <div className="flex items-center gap-2">
              <span className={isRemoving ? "text-gray-400" : ""}>{connection.institutionName}</span>
            </div>
          );
        default:
          return connection.institutionName;
      }
    },
    [removeConnection]
  );

  const hasRemovingItems = removingItems.size > 0;

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Remove connections</h3>
        {hasRemovingItems && (
          <Chip color="warning" variant="flat" size="sm">
            {removingItems.size} removing...
          </Chip>
        )}
      </div>
      
      <Table 
        aria-label="Bank connections removal table"
        className="min-h-[200px]"
      >
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn key={column.key}>{column.label}</TableColumn>
          )}
        </TableHeader>
        <TableBody
          items={rows(connections, removingItems)}
          emptyContent="No bank connections to remove."
        >
          {(item) => (
            <TableRow 
              key={item.key}
              className={item.isRemoving ? "opacity-60" : ""}
            >
              {(columnKey) => (
                <TableCell>{renderCell(item, columnKey)}</TableCell>
              )}
            </TableRow>
          )}
        </TableBody>
      </Table>
      
      {connections.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No bank connections found.</p>
          <p className="text-sm mt-2">Connect a bank account to see it here.</p>
        </div>
      )}
    </div>
  );
}
