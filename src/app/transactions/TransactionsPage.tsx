"use client";

import React, { useMemo, useState } from "react";
import { TransactionBase } from "plaid";
import DateRangePicker, {
  DateRange,
} from "@components/DateRangePicker/DateRangePicker";
import axios from "axios";
import {
  defaultCategories,
  defaultCategorieToValueObject,
} from "utils/constants";
import ReportCard from "@components/ReportCard/ReportCard";
import { CategoryValues } from "utils/types";
import PlaidButton from "@components/PlaidButton/PlaidButton";
import useUndoRedoState from "hooks/useUndoRedoState";
import TransactionsTable from "@components/TransactionsTable/TransactionsTable";
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@nextui-org/react";
import { useRouter } from "next/navigation";
import FullScreenOverlay from "@components/Loader/Loader";
import { ChevronDownIcon } from "assets/icons/ChevronDownIcon";

export type TransactionsPageProps = {
  isAccessTokenValid: boolean;
};

export default function TransactionsPage({
  isAccessTokenValid,
}: TransactionsPageProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editableTransaction, setEditableTransaction] = useState({} as TransactionBase);
  const [selectedCategory, setSelectedCategory] = useState(new Set<string>());
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [reportName, setReportName] = useState("");
  const [isReportNameValid, setIsReportNameValid] = useState(true);

  const { history, setHistory, index, lastIndex, goBack, goForward } =
    useUndoRedoState({ transactions: [], selectedKeys: new Set([]) });

  const { transactions, selectedKeys } = history;
  const canUndo = index > 1;
  const canRedo = index < lastIndex;

  const handleReportNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsReportNameValid(true);
    const reportNameRegex = /^[a-zA-Z0-9\s-]+$/;
    const reportName = e.target.value;
    if (reportName.length > 0 && reportNameRegex.test(reportName)) {
      setIsReportNameValid(true);
    } else {
      setIsReportNameValid(false);
    }
    setReportName(reportName);
  };

  const updateHistory = (
    transactions: TransactionBase[],
    selectedKeys: Set<string>
  ) => {
    const newState = {
      transactions,
      selectedKeys,
    };

    setHistory(newState);
  };

  const generateSelectedCategoryKeys = (transactions: TransactionBase[]) => {
    let newKeys = transactions.reduce(
      (acc: any, transaction: TransactionBase) => {
        if (transaction.category) {
          acc[transaction.transaction_id] = new Set([
            transaction.category[0].replace("and", "&").toLocaleLowerCase(),
          ]);
        } else {
          acc[transaction.transaction_id] = new Set(["others"]);
        }
        return acc;
      },
      {}
    );

    updateHistory(transactions, newKeys);
  };

  const isAllCategoriesAccepted = useMemo(() => {
    let result = true;
    Object.entries(selectedKeys).forEach(([_, iterator]) => {
      const val = iterator.values();
      const category: keyof CategoryValues = val.next().value;
      if (!defaultCategories.includes(category)) {
        result = false;
      }
    });
    return result;
  }, [selectedKeys]);

  const getTransactionData = async ({ startDate, endDate }: DateRange) => {
    setIsError(false);
    setErrorMessage("");

    try {
      setIsLoading(true);
      const res = await axios.get("/api/plaid/getTransactions", {
        params: {
          startDate,
          endDate,
        },
      });
      let reversedTransactions = res.data.transactions.reverse();
      generateSelectedCategoryKeys(reversedTransactions);
      setIsLoading(false);
    } catch(e) {
      console.error({e});
      setErrorMessage("Error fetching transactions, check your bank connections and try again.");
      setIsError(true);
      setIsLoading(false);
    }
  };

  const generatedReportData = useMemo(() => {
    let categoryValues = { ...defaultCategorieToValueObject };
    let totalExpenses = 0;

    Object.entries(selectedKeys).forEach(([transactionId, iterator]) => {
      const val = iterator.values();
      const category: keyof CategoryValues = val.next().value;
      if (defaultCategories.includes(category)) {
        const transactionIndex = transactions.findIndex(
          (transaction) => transaction.transaction_id === transactionId
        );
        categoryValues[category] += transactions[transactionIndex]?.amount || 0;
        if (category !== "revenue") {
          totalExpenses += transactions[transactionIndex]?.amount || 0;
        }
      }
    });
    const profit = Math.abs(categoryValues.revenue) - Math.abs(totalExpenses);
    return {
      ...categoryValues,
      expenses: -Number(totalExpenses.toFixed(2)),
      total: Math.ceil(profit),
    };
  }, [selectedKeys, transactions]);

  const handleSubmitReport = async () => {
    setIsError(false);
    setErrorMessage("");

    if (!isAllCategoriesAccepted) {
      setErrorMessage("Please make sure all categories are recognized");
      setIsError(true);
      return;
    }

    if (!isReportNameValid || reportName.length === 0) {
      setErrorMessage("Please enter a report name");
      setIsError(true);
      return;
    }

    try {
      setIsLoading(true);
      const body = {
        transactions,
        reportData: {
          ...generatedReportData,
          revenue: Math.abs(generatedReportData.revenue),
        },
        reportName,
      };

      const res = await axios.post("/api/prisma/reports/create", body);
      if (!res.data.success) {
        setIsLoading(false);
        setErrorMessage("Error submitting report");
        return setIsError(true);
      }
      setIsLoading(false);
      router.push("/reports");
    } catch (error) {
      setIsLoading(false);
      setIsError(true);
      setErrorMessage("Error submitting report");
    }
  };

  const handleEdit = (transactionId: string) => {
    setEditableTransaction(transactions.find((t) => t.transaction_id === transactionId) as TransactionBase);
    setSelectedCategory(new Set<string>());
    setIsModalOpen(true);
  }

  const getCategorySelected = useMemo(() => {
    const defaultCategory = editableTransaction?.category ? editableTransaction.category[0] : "Others";
    const categorySelected = selectedCategory.values().next().value;
    const val = categorySelected || defaultCategory;
    
    return val;
  }, [selectedCategory, editableTransaction]);

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formValues = e.target as HTMLFormElement;
    const prevTransactions = [...transactions];
    const newCategory = new Set().add(getCategorySelected);
    const transactionId = editableTransaction.transaction_id;
    const newKeys = { ...selectedKeys, [transactionId]: newCategory };

    const transactionIndex = prevTransactions.findIndex(
      (transaction) => transaction.transaction_id === transactionId
    );

    const updatedTransaction = {
      ...editableTransaction,
      original_description: (formValues[0] as HTMLInputElement)?.value,
      amount: -Number((formValues[1] as HTMLInputElement)?.value),
      category: [formValues[2]?.ariaLabel || "Others"],
    };
    
    prevTransactions[transactionIndex] = updatedTransaction;
    updateHistory(prevTransactions, newKeys);
    setIsModalOpen(false);
  }

  return (
    <div className="h-full">
      <h3 className="text-xl font-semibold mb-4">Transactions</h3>
      {isError && <p className="mb-4 text-danger">{errorMessage}</p>}
      {isAccessTokenValid ? (
        <DateRangePicker
          title="Select date range to fetch transactions"
          isLoading={isLoading}
          onFetch={getTransactionData}
        />
      ) : (
        <div>
          <p className="mb-4">
            You need to connect an account to fetch transactions
          </p>
          <PlaidButton />
        </div>
      )}
      {transactions.length > 0 && (
        <div className="flex flex-col gap-4">
          <Input
            type="text"
            label="Report name"
            placeholder="Enter a report name"
            className="w-fit"
            value={reportName}
            isInvalid={!isReportNameValid}
            errorMessage={!isReportNameValid && "Please enter a report name"}
            onChange={handleReportNameChange}
          />
          <div className="flex gap-4">
            <TransactionsTable
              canRedo={canRedo}
              canUndo={canUndo}
              generateSelectedCategoryKeys={generateSelectedCategoryKeys}
              goBack={goBack}
              goForward={goForward}
              selectedKeys={selectedKeys}
              transactions={transactions}
              updateHistory={updateHistory}
              onEdit={handleEdit}
            />
            <ReportCard
              showReportButton={transactions.length > 0}
              reportData={generatedReportData}
              handleSubmitReport={handleSubmitReport}
              fixedPosition
            />
          </div>
        </div>
      )}
      {isLoading && <FullScreenOverlay />}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        placement="top-center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Edit Transaction
              </ModalHeader>
              <form onSubmit={handleEditSubmit}>
                <ModalBody>
                  <Input
                    autoFocus
                    label="Description"
                    placeholder="Enter a description"
                    variant="bordered"
                    defaultValue={editableTransaction["original_description"] || ""}
                  />
                  <Input
                    label="Amount"
                    placeholder="Enter an amount"
                    type="number"
                    variant="bordered"
                    defaultValue={`${-editableTransaction.amount}`}
                  />
                  <div className="flex gap-2 items-center">
                    <span>Category:</span>
                  <Dropdown>
                    <DropdownTrigger>
                      <Button
                        color="primary"
                        variant="bordered"
                        className="capitalize"
                        aria-label={getCategorySelected}
                        endContent={<ChevronDownIcon className="text-small" />}
                      >
                        {getCategorySelected}
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Single selection example"
                      variant="flat"
                      color="primary"
                      disallowEmptySelection
                      selectionMode="single"
                      selectedKeys={Array.from(selectedCategory)}
                      onSelectionChange={(keys) =>
                        setSelectedCategory(keys as Set<string>)
                      }
                    >
                      {defaultCategories.map((category) => (
                        <DropdownItem key={category} className="capitalize">
                          {category}
                        </DropdownItem>
                      ))}
                    </DropdownMenu>
                  </Dropdown>
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button color="danger" variant="flat" onPress={onClose}>
                    Close
                  </Button>
                  <button>Save</button>
                </ModalFooter>
              </form>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
