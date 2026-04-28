"use client";

import React, { useMemo, useState } from "react";
import DateRangePicker, {
  DateRange,
} from "@components/DateRangePicker/DateRangePicker";
import axios from "axios";
import { sortTransactionsByDateDesc } from "utils/functions";
import {
  defaultCategories,
  defaultCategorieToValueObject,
} from "utils/constants";
import ReportCard from "@components/ReportCard/ReportCard";
import { CategoryValues, TransactionWithNotes } from "utils/types";
import PlaidButton from "@components/PlaidButton/PlaidButton";
import useUndoRedoState from "hooks/useUndoRedoState";
import TransactionsTable from "@components/TransactionsTable/TransactionsTable";
import { Input, Tab, Tabs } from "@heroui/react";
import { useRouter } from "next/navigation";
import FullScreenOverlay from "@components/Loader/Loader";
import EditTransactionModal from "@components/EditTransactionModal/EditTransactionModal";
import { useQuery } from "@tanstack/react-query";
import PageLoader from "@components/PageLoader/PageLoader";
import usePreventNavigation from "@components/hooks/usePreventNavigation";
import { useDeviceSize } from "@components/hooks/useDeviceSize";
import { useNavigateWithPending } from "@hooks/useNavigateWithPending";

export default function TransactionsPage() {
  const router = useRouter();
  const { navigate, isPending: isNavigating } = useNavigateWithPending();
  const isMobile = useDeviceSize();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editableTransaction, setEditableTransaction] = useState({} as TransactionWithNotes);
  const [selectedCategory, setSelectedCategory] = useState(new Set<string>());
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [reportName, setReportName] = useState("");
  const [isReportNameValid, setIsReportNameValid] = useState(true);
  
  const { isPending, data: isValid } = useQuery({
    queryKey: ['accessTokenValid'],
    queryFn: async () => {
      const response = await fetch('/api/accessToken/checkValid')
      const data = await response.json()
      return data?.isAccessTokenValid || false;
    }
  });
  
  const { history, setHistory, index, lastIndex, goBack, goForward } =
    useUndoRedoState({ transactions: [], selectedKeys: new Set([]) });

  const { transactions, selectedKeys } = history;
  const canUndo = index > 1;
  const canRedo = index < lastIndex;

  usePreventNavigation(canUndo);

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
    transactions: TransactionWithNotes[],
    selectedKeys: Set<string>
  ) => {
    const newState = {
      transactions,
      selectedKeys,
    };

    setHistory(newState);
  };

  const generateSelectedCategoryKeys = (transactions: TransactionWithNotes[]) => {
    let newKeys = transactions.reduce(
      (acc: any, transaction: TransactionWithNotes) => {
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
      const sortedTransactions = sortTransactionsByDateDesc(
        res.data.transactions as TransactionWithNotes[]
      );
      generateSelectedCategoryKeys(sortedTransactions);
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
      total: profit,
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
      navigate("/reports");
    } catch (error) {
      setIsLoading(false);
      setIsError(true);
      setErrorMessage("Error submitting report");
    }
  };

// This needs to be refactored into a hook
  const handleEdit = (transactionId: string) => {
    setEditableTransaction(transactions.find((t) => t.transaction_id === transactionId) as TransactionWithNotes);
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
    const newCategory = new Set().add(getCategorySelected.toLowerCase());
    const transactionId = editableTransaction.transaction_id;
    const newKeys = { ...selectedKeys, [transactionId]: newCategory };
    const transactionIndex = prevTransactions.findIndex(
      (transaction) => transaction.transaction_id === transactionId
    );

    const updatedTransaction = {
      ...editableTransaction,
      original_description: (formValues[0] as HTMLInputElement)?.value,
      amount: -Number((formValues[1] as HTMLInputElement)?.value),
      notes: (formValues[2] as HTMLTextAreaElement)?.value || undefined,
      category: [formValues[3]?.ariaLabel || "Others"],
    };
    
    prevTransactions[transactionIndex] = updatedTransaction;
    updateHistory(prevTransactions, newKeys);
    setIsModalOpen(false);
  }
////////////////////////////////////////

  if (isPending) {
    return <PageLoader />;
  }

  const renderTransactionsTable = () => (
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
  );

  const renderReportCard = () => (
    <ReportCard
      showReportButton={transactions.length > 0}
      reportData={generatedReportData}
      handleSubmitReport={handleSubmitReport}
      fixedPosition={!isMobile}
    />
  );

  const renderTabs = () =>
    isMobile ? (
      <Tabs aria-label="Options">
        <Tab key="transactions" title="Transactions">
          {renderTransactionsTable()}
        </Tab>
        <Tab key="report" title="Report">
          {renderReportCard()}
        </Tab>
      </Tabs>
    ) : (
      <div className="flex gap-4">
        {renderTransactionsTable()}
        {renderReportCard()}
      </div>
    );

  return (
    <div className="h-inherit">
      {isError && <p className="mb-4 text-danger">{errorMessage}</p>}
      {isValid ? (
        <DateRangePicker
          label="Select date range to fetch transactions"
          labelPlacement="outside"
          onSubmit={getTransactionData}
          buttonText="Fetch Transactions"
          className="w-fit mb-4"
          isLoading={isLoading}
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
            variant="faded"
            value={reportName}
            isInvalid={!isReportNameValid}
            errorMessage={!isReportNameValid && "Please enter a report name"}
            onChange={handleReportNameChange}
          />
          {renderTabs()}
        </div>
      )}
      {(isLoading || isNavigating) && <FullScreenOverlay />}
      <EditTransactionModal
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        editableTransaction={editableTransaction}
        getCategorySelected={getCategorySelected}
        selectedCategory={selectedCategory}
        handleEditSubmit={handleEditSubmit}
        setSelectedCategory={setSelectedCategory}
      />
    </div>
  );
}
