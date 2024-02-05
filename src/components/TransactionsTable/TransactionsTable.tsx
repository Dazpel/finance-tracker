import { InfoIcon } from "@components/icons/accounts/info-icon";
import { DeleteIcon } from "@components/icons/table/delete-icon";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
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
import { TransactionBase } from "plaid";
import React, { useMemo, useState } from "react";
import {
  defaultCategories,
  defaultCategoryFilterOptions,
} from "utils/constants";
import { formatDate } from "utils/functions";
import { defaultColorVariants } from "utils/types";
import { v4 as uuidv4 } from "uuid";

type TableMode = "view" | "edit";

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
};

enum TableAction {
  Delete = "Delete",
  Create = "Create",
  UpdatePrice = "UpdatePrice",
  UpdateDescription = "UpdateDescription",
}

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

const rows = (transactions: TransactionBase[]): TableRow[] => {
  return transactions.map((transaction) => ({
    key: transaction.transaction_id,
    date: transaction.date,
    description: transaction.name || "",
    category: transaction.category
      ? transaction.category[0].replace("and", "&")
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

  const handleSelectionChange = (keys: Set<string>, id: string) => {
    const prevKeys = { ...selectedKeys };
    const selectedCategories = new Set();
    keys.forEach((key) => selectedCategories.add(key));

    const newKeys = { ...prevKeys, [id]: selectedCategories };

    const prevTransactions = [...transactions];
    const transactionIndex = prevTransactions.findIndex(
      (transaction) => transaction.transaction_id === id
    );

    if (transactionIndex === -1) {
      return prevTransactions;
    }

    const updatedTransactions = [...prevTransactions];
    updatedTransactions[transactionIndex] = {
      ...updatedTransactions[transactionIndex],
      category: Array.from(keys),
    };

    return updateHistory(updatedTransactions, newKeys);
  };

  const handleCreateTransaction = (
    transactions: TransactionBase[],
    currentKeys: Set<string>
  ) => {
    const prevTransactions = [...transactions];
    const newTransaction = {
      transaction_id: uuidv4(),
      date: formatDate(new Date()),
      name: "New Transaction",
      category: ["Others"],
      amount: 0,
    };

    prevTransactions.push(newTransaction as any);
    return generateSelectedCategoryKeys(prevTransactions);
  };

  const handleTableActions = (
    e?: React.ChangeEvent<HTMLInputElement> | null,
    transactionId?: string,
    action: TableAction = TableAction.Create
  ) => {
    const value = e ? e.target.value : null;
    
    const prevTransactions = [...transactions];
    const prevKeys = { ...selectedKeys };
    const transactionIndex = prevTransactions.findIndex(
      (transaction) => transaction.transaction_id === transactionId
    );

    if (transactionIndex === -1 && action !== TableAction.Create) {
      return prevTransactions;
    }

    let updatedTransactions = [...prevTransactions];

    if (action === TableAction.Delete) {
      updatedTransactions.splice(transactionIndex, 1);
      return generateSelectedCategoryKeys(updatedTransactions);
    }

    if (action === TableAction.UpdatePrice && value !== null) {
      updatedTransactions[transactionIndex] = {
        ...updatedTransactions[transactionIndex],
        amount: Number(-value),
      };
      return updateHistory(updatedTransactions, prevKeys);
    }

    if (action === TableAction.UpdateDescription) {
      updatedTransactions[transactionIndex] = {
        ...updatedTransactions[transactionIndex],
        name: value ?? "",
      };
      return updateHistory(updatedTransactions, prevKeys);
    }
  };

  const renderDropDown = (transactionId: string) => {
    let categories = defaultCategories;
    let categoryColor = defaultColorVariants.primary;
    const invalidCategory = !defaultCategories.includes(
      selectedValues[transactionId]
    );

    if (invalidCategory) {
      categoryColor = defaultColorVariants.danger;
    }

    return (
      <div className="flex items-center gap-2">
        <Dropdown>
          <DropdownTrigger>
            <Button
              color={categoryColor}
              variant="bordered"
              className="capitalize"
              endContent={<ChevronDownIcon className="text-small" />}
            >
              {invalidCategory && (
                <Tooltip
                  content="This category is not recognized, please select a different one"
                  color="danger"
                >
                  <p>
                    <InfoIcon />
                  </p>
                </Tooltip>
              )}
              {selectedValues[transactionId]}
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Single selection example"
            variant="flat"
            color="primary"
            disallowEmptySelection
            selectionMode="single"
            //@ts-ignore
            selectedKeys={selectedKeys[transactionId]}
            onSelectionChange={(keys) =>
              handleSelectionChange(keys as Set<string>, transactionId)
            }
          >
            {categories.map((category) => (
              <DropdownItem key={category} className="capitalize">
                {category}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
      </div>
    );
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
            <Dropdown>
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
                  handleCreateTransaction(transactions, selectedKeys)
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
            <Input
              isReadOnly={!canEdit}
              type="number"
              value={`${-cellValue}`}
              onChange={(e) =>
                handleTableActions(
                  e,
                  transaction["key"],
                  TableAction.UpdatePrice
                )
              }
            />
          );
        case "description":
          return (
            <Input
              isReadOnly={!canEdit}
              type="text"
              value={cellValue}
              onChange={(e) =>
                handleTableActions(
                  e,
                  transaction["key"],
                  TableAction.UpdateDescription
                )
              }
            />
          );
        case "category":
          return canEdit ? (
            renderDropDown(transaction["key"])
          ) : (
            <span className="capitalize">
              {selectedValues[transaction["key"]]}
            </span>
          );
        case "actions":
          return (
            <div className="text-center">
              <Tooltip content="Delete transaction" color="danger">
                <button
                  onClick={() =>
                    handleTableActions(
                      null,
                      transaction["key"],
                      TableAction.Delete
                    )
                  }
                >
                  <DeleteIcon size={20} fill="#D32F2F" />
                </button>
              </Tooltip>
            </div>
          );
        default:
          return cellValue;
      }
    },
    [selectedKeys]
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
        items={rows(filteredItems)}
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
