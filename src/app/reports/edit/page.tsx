"use client";

import React, { useEffect, useMemo, useState, use } from "react";
import EditTransactionModal from "@components/EditTransactionModal/EditTransactionModal";
import { useDeviceSize } from "@components/hooks/useDeviceSize";
import FullScreenOverlay from "@components/Loader/Loader";
import ReportCard from "@components/ReportCard/ReportCard";
import TransactionsTable from "@components/TransactionsTable/TransactionsTable";
import { Input, Tab, Tabs } from "@heroui/react";
import axios from "axios";
import useUndoRedoState from "hooks/useUndoRedoState";
import { useRouter } from "next/navigation";
import {
  defaultCategorieToValueObject,
  defaultCategories,
} from "utils/constants";
import { convertToCSV, decodeQueryString, filterTransactions, formatCreatedDate } from "utils/functions";
import { CategoryValues, TransactionWithNotes } from "utils/types";

const noop = () => {};

const handleDownload = (transactions: TransactionWithNotes[]) => {
  const csvData = transactions.map(({ amount, category, date, name }) => ({
    amount,
    category,
    date,
    name,
  }));

  const csv = convertToCSV(csvData);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'transactions.csv');
  link.click();
};

export default function Page(
  props: {
    searchParams: Promise<{ data: string }>;
  }
) {
  const searchParams = use(props.searchParams);
  //todo: abstract generateSelectedCategoryKeys so it can be reused
  const isMobile = useDeviceSize();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editableTransaction, setEditableTransaction] = useState({} as TransactionWithNotes);
  const [selectedCategory, setSelectedCategory] = useState(new Set<string>());
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const reportData = decodeQueryString(searchParams.data);

  const { reportName: currentReportName, createdAt, id, reportType, status, ...rest } = reportData;
  const isPendingReport = status === "DRAFT" || status === "PENDING_APPROVAL";

  const [reportName, setReportName] = useState(currentReportName);
  const [isReportNameValid, setIsReportNameValid] = useState(true);

  const { history, setHistory, index, lastIndex, goBack, goForward } =
    useUndoRedoState({ transactions: [], selectedKeys: new Set([]) });

  const { transactions, selectedKeys } = history;
  const canUndo = index > 1;
  const canRedo = index < lastIndex;

  const handleReportNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsReportNameValid(true);
    const reportNameRegex = /^[a-zA-Z0-9\s]+$/;
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
          totalExpenses += transactions[transactionIndex]?.amount || 0
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

  const handleUpdateReport = async () => {
    setIsLoading(true);
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
      const body = {
        transactions,
        reportId: id,
        reportData: generatedReportData,
        reportName,
      };

      const res = await axios.post("/api/prisma/reports/update", body);
      if (!res.data.success) {
        setErrorMessage("Error submitting report");
        return setIsError(true);
      }
      router.push("/reports");
    } catch (error) {
      setIsError(true);
      setErrorMessage("Error submitting report");
    }
  };

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
    const newCategory = new Set().add(getCategorySelected);
    const transactionId = editableTransaction.transaction_id;
    const newKeys = { ...selectedKeys, [transactionId]: newCategory };

    const transactionIndex = prevTransactions.findIndex(
      (transaction) => transaction.transaction_id === transactionId
    );

    const updatedTransaction = {
      ...editableTransaction,
      name: (formValues[0] as HTMLInputElement)?.value,
      amount: -Number((formValues[1] as HTMLInputElement)?.value),
      notes: (formValues[2] as HTMLTextAreaElement)?.value || undefined,
      category: [formValues[3]?.ariaLabel || "Others"],
    };
    
    prevTransactions[transactionIndex] = updatedTransaction;
    updateHistory(prevTransactions, newKeys);
    setIsModalOpen(false);
  }

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/prisma/transactions/get?reportId=${id}&reportType=${reportType}`,
        {
          method: "GET",
        }
      );
      const res = await response.json();
      if (res.success) {
        let transactions = res.response.data.transactions;

        if (reportType === "ANNUAL") {
          transactions = filterTransactions(res.response.data.childReports);
        }
        
        generateSelectedCategoryKeys(transactions);
      }
      setIsLoading(false);
    } catch (error) {
      console.log({ error });
      setIsError(true);
      setErrorMessage("Error fetching transactions");
      setIsLoading(false);
    }
  };

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
      descriptionToUse="name"
      isPendingReport={isPendingReport}
    />
  );

  const renderReportCard = () => (
    <ReportCard
      actionButtonText="Update Report"
      showReportButton={transactions.length > 0}
      reportData={generatedReportData}
      handleSubmitReport={handleUpdateReport}
      fixedPosition={!isMobile}
    />
  );

  const renderTabs = () =>
    isMobile ? (
      <Tabs aria-label="Options" className="mt-4">
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

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      await fetchTransactions();
    };
    if (isMounted) {
      fetchData();
    }
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xl font-semibold mb-4">Editing Report</h3>
      <div className="flex flex-col gap-2">
        <p className="font-bold">
          Report Name: <span className="font-normal">{reportName}</span>
        </p>
        <p className="font-bold">
          Created:{" "}
          <span className="font-normal">{formatCreatedDate(createdAt)}</span>
        </p>
        {isError && <p className="mb-4 text-danger">{errorMessage}</p>}
        {/* <button onPress={() => handleDownload(transactions)}>Download CSV</button> */}
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
      </div>
      {isLoading && <FullScreenOverlay />}
      <EditTransactionModal 
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        editableTransaction={editableTransaction}
        getCategorySelected={getCategorySelected}
        selectedCategory={selectedCategory}
        handleEditSubmit={handleEditSubmit}
        setSelectedCategory={setSelectedCategory}
        descriptionToUse="name"
        isPendingReport={isPendingReport}
      />
    </div>
  );
}
