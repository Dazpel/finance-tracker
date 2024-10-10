import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Selection,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from "@nextui-org/react";
import { ChevronDownIcon } from "assets/icons/ChevronDownIcon";
import { PlusIcon } from "assets/icons/PlusIcon";
import RedoIcon from "assets/icons/RedoIcon";
import UndoIcon from "assets/icons/UndoIcon";
import { VerticalDotsIcon } from "assets/icons/VerticalDotsIcon";
import { TransactionBase } from "plaid";
import React, { useMemo, useState } from "react";
import {
  LOCAL_ACCOUNT_ID,
  defaultCategoryFilterOptions,
} from "utils/constants";
import { formatDate } from "utils/functions";;
import { v4 as uuidv4 } from "uuid";

type TableMode = "view" | "edit";

type DescriptionName = "original_description" | "name";

type TransactionsTableProps = {
  tableMode?: TableMode;
  transactions: TransactionBase[];
  selectedKeys: Set<string>;
  canUndo?: boolean;
  canRedo?: boolean;
  updateHistory: (
    transactions: TransactionBase[],
    selectedKeys: Set<string>
  ) => void;
  goForward: (steps?: number) => void;
  goBack: (steps?: number) => void;
  generateSelectedCategoryKeys: (transactions: TransactionBase[]) => void;
  descriptionToUse?: DescriptionName;
  onEdit: (transactionId: string) => void;
};

type TableRow = {
  key: string;
  date: string;
  description: string;
  category: string;
  amount: number;
};

const defaultColumns = [
  {
    key: "date",
    label: "DATE",
  },
  {
    key: "description",
    label: "DESCRIPTION",
  },
  {
    key: "category",
    label: "CATEGORY",
  },
  {
    key: "amount",
    label: "AMOUNT",
  },
  {
    key: "actions",
    label: "ACTIONS",
  },
];

const rows = (transactions: TransactionBase[], descriptionToUse: DescriptionName): TableRow[] => {
  return transactions.map((transaction) => ({
    key: transaction.transaction_id,
    date: transaction.date,
    description: transaction[descriptionToUse] || "",
    category: transaction.category
      ? transaction.category[0]
      : "",
    amount: Number((transaction.amount).toFixed(2)),
  }));
};

export default function TransactionsTable({
  tableMode = "edit",
  transactions,
  selectedKeys,
  canRedo = false,
  canUndo = false,
  updateHistory,
  goBack,
  goForward,
  generateSelectedCategoryKeys,
  descriptionToUse = "original_description",
  onEdit,
}: TransactionsTableProps) {
  const canEdit = tableMode === "edit";
  const [categoryFilter, setCategoryFilter] = useState<Selection>("all");

  const capitalize = (s: string) => {
    const wordArray = s.split(" ");
    const capitalizedWords = wordArray.map(
      (word) => word.charAt(0).toUpperCase() + word.slice(1)
    );
    return capitalizedWords.join(" ");
  };

  const colums = useMemo(() => {
    let colums = [...defaultColumns];
    if (!canEdit) colums.pop();
    return colums;
  }, [canEdit]);

  const selectedValues = useMemo(() => {
    return Object.fromEntries(
      Object.entries(selectedKeys).map(([rowId, categories]) => [
        rowId,
        Array.from(categories).join(", ").replaceAll("_", " "),
      ])
    );
  }, [selectedKeys]);

  const handleCategoryFilterChange = (keys: any) => {
    if (keys?.currentKey === undefined) {
      return setCategoryFilter(new Set([]));
    }

    if (keys?.currentKey === "All") {
      return setCategoryFilter("all");
    }

    if (keys?.currentKey === "None") {
      return setCategoryFilter(new Set([]));
    }

    return setCategoryFilter(keys);
  };

  const handleCreateTransaction = (transactions: TransactionBase[]) => {
    const prevTransactions = [...transactions];
    const newTransaction = {
      transaction_id: uuidv4(),
      account_id: LOCAL_ACCOUNT_ID,
      date: formatDate(new Date()),
      [descriptionToUse]: "New Transaction",
      category: ["Others"],
      amount: 0,
    };

    prevTransactions.unshift(newTransaction as any);
    return generateSelectedCategoryKeys(prevTransactions);
  };

  const onDelete = (transactionId?: string) => {
    const prevTransactions = [...transactions];
    const transactionIndex = prevTransactions.findIndex(
      (transaction) => transaction.transaction_id === transactionId
    );

    if (transactionIndex === -1) {
      return prevTransactions;
    }

    let updatedTransactions = [...prevTransactions];

    updatedTransactions.splice(transactionIndex, 1);
    return generateSelectedCategoryKeys(updatedTransactions);
  };

  const filteredItems = useMemo(() => {
    let filteredTransactions = [...transactions];

    if (
      categoryFilter !== "all" &&
      Array.from(categoryFilter).length !== defaultCategoryFilterOptions.length
    ) {
      filteredTransactions = filteredTransactions.filter((transaction) => {
        return transaction.category
          ? Array.from(categoryFilter).includes(
              capitalize(transaction.category[0].replace("and", "&"))
            )
          : transaction;
      });
    }

    return filteredTransactions;
  }, [transactions, categoryFilter]);

  const topContent = useMemo(() => {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-between gap-3 items-end">
          <div className="flex gap-3">
            <Dropdown shouldBlockScroll={false}>
              <DropdownTrigger className="hidden sm:flex">
                <Button
                  endContent={<ChevronDownIcon className="text-small" />}
                  variant="flat"
                >
                  Category
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                disallowEmptySelection
                aria-label="Table Columns"
                closeOnSelect={false}
                selectedKeys={categoryFilter}
                selectionMode="multiple"
                onSelectionChange={(keys) =>
                  handleCategoryFilterChange(keys as Set<string>)
                }
              >
                {defaultCategoryFilterOptions.map((category) => (
                  <DropdownItem key={category.uid} className="capitalize">
                    {category.name}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>
            {canEdit && (
              <Button
                onClick={() =>
                  handleCreateTransaction(transactions)
                }
                color="primary"
                endContent={<PlusIcon />}
              >
                Add Transaction
              </Button>
            )}
            {canUndo && canEdit && (
              <Tooltip content="Undo action" color="default">
                <Button
                  isIconOnly
                  onClick={() => goBack()}
                  variant="flat"
                  aria-label="undo"
                >
                  <UndoIcon />
                </Button>
              </Tooltip>
            )}
            {canRedo && canEdit && (
              <Tooltip content="Redo action" color="default">
                <Button
                  isIconOnly
                  onClick={() => goForward()}
                  variant="flat"
                  aria-label="redo"
                >
                  <RedoIcon />
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    );
  }, [categoryFilter, transactions.length, selectedKeys, canUndo, canRedo]);

  const renderCell = React.useCallback(
    (transaction: TableRow, columnKey: React.Key) => {
      const cellValue = transaction[columnKey as keyof TableRow] as string;

      switch (columnKey) {
        case "amount":
          return (
            <span>{-cellValue}</span>
          );
        case "category":
          return (
            <span className="capitalize">
              {selectedValues[transaction["key"]]}
            </span>
          )
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
                  <DropdownItem onClick={() => onEdit(transaction["key"])}>Edit</DropdownItem>
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
    [selectedKeys, transactions, selectedValues]
  );

  return (
    <Table
      aria-label="Transactions table"
      topContent={topContent}
      topContentPlacement="inside"
      classNames={{
        th: "last:text-center",
      }}
    >
      <TableHeader columns={colums}>
        {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
      </TableHeader>
      <TableBody
        items={rows(filteredItems, descriptionToUse)}
        emptyContent="No transactions found yet."
      >
        {(item) => (
          <TableRow className="hover:bg-default-100" key={item.key}>
            {(columnKey) => (
              <TableCell>{renderCell(item, columnKey)}</TableCell>
            )}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
