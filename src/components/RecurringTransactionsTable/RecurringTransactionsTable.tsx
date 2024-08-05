'use client';

import React, { useMemo } from "react";
import {
    Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from "@nextui-org/react";
import { TransactionStream } from "plaid";
import { TableRowType, defaultColumns, rows } from "./constants";
import { PlusIcon } from "assets/icons/PlusIcon";
import { v4 as uuidv4 } from "uuid";
import { LOCAL_ACCOUNT_ID } from "utils/constants";
import { FlowType } from "app/recurring-transactions/RecurringTransactionsPage";
import { VerticalDotsIcon } from "assets/icons/VerticalDotsIcon";

type TableMode = "view" | "edit";

type RecurringTransactionsTableProps = {
  transactions: TransactionStream[];
  onUpdate: (transactions: TransactionStream[], type: FlowType) => void;
  onEdit: (streamId: string, type: FlowType) => void;
  flowType: FlowType;
  tableMode?: TableMode;
};

function RecurringTransactionsTable({
  transactions,
    onUpdate,
    flowType,
    onEdit,
    tableMode = "edit",
}: RecurringTransactionsTableProps) {
    const canEdit = tableMode === "edit";

    const colums = useMemo(() => {
        let colums = [...defaultColumns];
        if (!canEdit) colums.pop();
        return colums;
      }, [canEdit]);

    const handleCreateTransaction = async (
      transactions: TransactionStream[]
    ) => {
      const prevTransactions = [...transactions];
      const newTransaction = {
        stream_id: uuidv4(),
        account_id: LOCAL_ACCOUNT_ID,
        last_date: '2024-01-01',
        description: "New Transaction",
        frequency: "MONTHLY",
        amount: 0,
      };

      prevTransactions.unshift(newTransaction as any);
      return onUpdate(prevTransactions, flowType);
    };

    const onDelete = (streamId?: string) => {
      const prevTransactions = [...transactions];
      const transactionIndex = prevTransactions.findIndex(
        (transaction) => transaction.stream_id === streamId
      );
        
      if (transactionIndex === -1) {
        return prevTransactions;
      }

      let updatedTransactions = [...prevTransactions];

      updatedTransactions.splice(transactionIndex, 1);
      
      return onUpdate(updatedTransactions, flowType);
    };

    const renderCell = React.useCallback(
      (transaction: TableRowType, columnKey: React.Key) => {
        const cellValue = transaction[columnKey as keyof TableRowType] as string;
        
        switch (columnKey) {
          case "day":
            return cellValue?.split("-")[2];
          case "amount":
            return Math.abs(Number(cellValue)).toFixed(2);
          case "actions":
            return (
              <div className="text-center">
                <Dropdown aria-label="actions dropdown">
                  <DropdownTrigger>
                    <Button isIconOnly size="sm" variant="light">
                      <VerticalDotsIcon className="text-default-300" />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu aria-label="dropdown options">
                    <DropdownItem
                      onClick={() => onEdit(transaction["key"], flowType)}
                    >
                      Edit
                    </DropdownItem>
                    <DropdownItem onClick={() => onDelete(transaction["key"])}>
                      Delete
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </div>
            );
          default:
            return cellValue;
        }
      },
      [transactions]
    );

      const topContent = useMemo(() => {
        if (!canEdit) return null;
        return (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between gap-3 items-end">
              <div className="flex gap-3">
                    <Button
                    onClick={() =>
                      handleCreateTransaction(transactions)
                    }
                    color="primary"
                    endContent={<PlusIcon />}
                  >
                    Add Transaction
                  </Button>
              </div>
            </div>
          </div>
        );
      }, [transactions, canEdit]);


  return (
    <Table
      aria-label="Transactions table"
      topContent={topContent}
    >
      <TableHeader columns={colums}>
        {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
      </TableHeader>
      <TableBody
        items={rows(transactions, !canEdit)}
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
