import { InfoIcon } from "@components/icons/table/info-icon";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Selection,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from "@heroui/react";
import { ChevronDownIcon } from "assets/icons/ChevronDownIcon";
import { PlusIcon } from "assets/icons/PlusIcon";
import RedoIcon from "assets/icons/RedoIcon";
import UndoIcon from "assets/icons/UndoIcon";
import UploadIcon from "assets/icons/UploadIcon";
import { VerticalDotsIcon } from "assets/icons/VerticalDotsIcon";
import React, { useMemo, useRef, useState } from "react";
import {
  LOCAL_ACCOUNT_ID,
  defaultCategories,
  defaultCategoryFilterOptions,
} from "utils/constants";
import { formatDate, sortTransactionsByDateDesc } from "utils/functions";
import { defaultColorVariants, TransactionWithNotes } from "utils/types";
import { parseCSV } from "utils/csvParser";
import { v4 as uuidv4 } from "uuid";
import { NotesIcon } from "assets/icons/NotesIcon";

type TableMode = "view" | "edit";

type DescriptionName = "original_description" | "name";

type TransactionsTableProps = {
  tableMode?: TableMode;
  transactions: TransactionWithNotes[];
  selectedKeys: Set<string>;
  canUndo?: boolean;
  canRedo?: boolean;
  updateHistory: (
    transactions: TransactionWithNotes[],
    selectedKeys: Set<string>
  ) => void;
  goForward: (steps?: number) => void;
  goBack: (steps?: number) => void;
  generateSelectedCategoryKeys: (transactions: TransactionWithNotes[]) => void;
  descriptionToUse?: DescriptionName;
  onEdit: (transactionId: string) => void;
  isPendingReport?: boolean;
};

type TableRow = {
  key: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  notes?: string;
  account_id?: string;
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

const rows = (transactions: TransactionWithNotes[], descriptionToUse: DescriptionName): TableRow[] => {
  return transactions.map((transaction) => ({
    key: transaction.transaction_id,
    date: transaction.date,
    description: transaction[descriptionToUse] || "",
    category: transaction.category
      ? transaction.category[0]
      : "",
    amount: Number((transaction.amount).toFixed(2)),
    notes: transaction.notes,
    account_id: transaction.account_id,
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
  isPendingReport = false,
}: TransactionsTableProps) {
  const canEdit = tableMode === "edit";
  // Pending auto-draft reports persist edits on SyncedTransaction (soft-delete
  // + category override). Adding rows / CSV upload have no SyncedTransaction
  // to attach to, so those affordances are hidden.
  const canAddRows = canEdit && !isPendingReport;
  const [categoryFilter, setCategoryFilter] = useState<Selection>("all");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleDateChange = React.useCallback((newDate: string, id: string) => {
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
      date: newDate,
    };

    return updateHistory(updatedTransactions, selectedKeys);
  }, [transactions, selectedKeys, updateHistory]);

  const handleCreateTransaction = (transactions: TransactionWithNotes[]) => {
    const prevTransactions = [...transactions];
    const newTransaction = {
      transaction_id: uuidv4(),
      account_id: LOCAL_ACCOUNT_ID,
      date: formatDate(new Date()),
      [descriptionToUse]: "New Transaction",
      category: ["Others"],
      amount: 0,
      notes: undefined,
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


  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }

    setIsUploading(true);
    
    try {
      const text = await file.text();
      const newTransactions = parseCSV(text, descriptionToUse);
      
      if (newTransactions.length === 0) {
        alert('No valid transactions found in the CSV file');
        return;
      }

      // Add new transactions to the beginning of the existing transactions
      const updatedTransactions = [...newTransactions, ...transactions];
      generateSelectedCategoryKeys(updatedTransactions);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error parsing CSV:', error);
      alert('Error parsing CSV file. Please check the format and try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
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

    return sortTransactionsByDateDesc(filteredTransactions);
  }, [transactions, categoryFilter]);

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
            className="max-h-64 overflow-y-auto"
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
                className="max-h-64 overflow-y-auto"
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
            {canAddRows && (
              <>
                <Button
                  onPress={() =>
                    handleCreateTransaction(transactions)
                  }
                  color="primary"
                  endContent={<PlusIcon />}
                >
                  Add Transaction
                </Button>
                <Button
                  onPress={triggerFileUpload}
                  color="primary"
                  variant="bordered"
                  isDisabled={isUploading}
                  endContent={isUploading ? <Spinner size="sm" /> : <UploadIcon />}
                >
                  {isUploading ? "Uploading..." : "Upload CSV"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  style={{ display: 'none' }}
                />
              </>
            )}
            {canUndo && canEdit && (
              <Tooltip content="Undo action" color="default">
                <Button
                  isIconOnly
                  onPress={() => goBack()}
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
                  onPress={() => goForward()}
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
  }, [categoryFilter, transactions.length, selectedKeys, canUndo, canRedo, isUploading]);

  const renderCell = React.useCallback(
    (transaction: TableRow, columnKey: React.Key) => {
      const cellValue = transaction[columnKey as keyof TableRow] as string;
      const isAddedTransaction = transaction.account_id === LOCAL_ACCOUNT_ID;

      switch (columnKey) {
        case "date":
          return canEdit && isAddedTransaction ? (
            <Input
              type="date"
              value={cellValue}
              variant="bordered"
              size="sm"
              classNames={{
                input: "text-small",
                inputWrapper: "h-8 min-h-8",
              }}
              onChange={(e) => handleDateChange(e.target.value, transaction.key)}
            />
          ) : (
            <span>{cellValue}</span>
          );
        case "amount":
          return (
            <span>{-cellValue}</span>
          );
        case "description":
          return (
            <div className="flex items-center gap-2">
              <span>{cellValue}</span>
              {transaction.notes && (
                <Tooltip 
                  content={`Notes: ${transaction.notes}`} 
                  color="default"
                  placement="top"
                  showArrow
                  delay={300}
                  closeDelay={100}
                >
                  <span className="cursor-pointer">
                    <NotesIcon className="text-green-500" size={16} />
                  </span>
                </Tooltip>
              )}
            </div>
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
              <Dropdown aria-label="actions dropdown">
                <DropdownTrigger>
                  <Button isIconOnly size="sm" variant="light">
                    <VerticalDotsIcon className="text-default-300" />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu aria-label="dropdown options">
                  <DropdownItem key="edit transaction button" onPress={() => onEdit(transaction["key"])}>Edit</DropdownItem>
                  <DropdownItem key="delete transaction button" onPress={() => onDelete(transaction["key"])}>
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
    [selectedKeys, transactions, selectedValues, canEdit, handleDateChange]
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
