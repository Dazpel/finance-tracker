'use client';

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from "@nextui-org/react";
import { TransactionStream } from "plaid";
import { TableRowType, defaultColumns, rows } from "./constants";

type RecurringTransactionsTableProps = {
  transactions: TransactionStream[];
};

function RecurringTransactionsTable({
  transactions,
}: RecurringTransactionsTableProps) {
    const renderCell = React.useCallback(
        (transaction: TableRowType, columnKey: React.Key) => {
          const cellValue = transaction[columnKey as keyof TableRowType] as string;
    
          switch (columnKey) {
            case "lastPayment":
                const month = cellValue.split("-")[1];
                const day = cellValue.split("-")[2];
                
              return (
                `${month}-${day}`
              );
            default:
              return cellValue;
          }
        },
        [transactions]
      );
  return (
    <Table
      aria-label="Transactions table"
    >
      <TableHeader columns={defaultColumns}>
        {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
      </TableHeader>
      <TableBody
        items={rows(transactions)}
        emptyContent="No transactions found yet."
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
  );
}

export default RecurringTransactionsTable;
