"use client";

import ReportCard from "@components/ReportCard/ReportCard";
import TransactionsTable from "@components/TransactionsTable/TransactionsTable";
import { Button, Input } from "@nextui-org/react";
import axios from "axios";
import useUndoRedoState from "hooks/useUndoRedoState";
import { useRouter } from "next/navigation";
import { TransactionBase } from "plaid";
import React, { useEffect, useMemo, useState } from "react";
import {
  defaultCategorieToValueObject,
  defaultCategories,
} from "utils/constants";
import { decodeQueryString, formatCreatedDate } from "utils/functions";
import { CategoryValues } from "utils/types";

const noop = () => {};

export default function Page({
  searchParams,
}: {
  searchParams: { data: string };
}) {
  //todo: abstract generateSelectedCategoryKeys so it can be reused
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [displayTransactions, setDisplayTransactions] = useState(false);
  const reportData = decodeQueryString(searchParams.data);
  const { reportName: currentReportName, createdAt, id, ...rest } = reportData;

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
    //   router.push("/reports");
    } catch (error) {
      setIsError(true);
      setErrorMessage("Error submitting report");
    }
  };

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/prisma/transactions/get?reportId=${id}`,
        {
          method: "GET",
        }
      );
      const res = await response.json();
      if (res.success) {
        generateSelectedCategoryKeys(res.response.data.transactions);
      }
      setIsLoading(false);
    } catch (error) {
      console.log({ error });
      setIsError(true);
      setErrorMessage("Error fetching transactions");
      setIsLoading(false);
    }
  };

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
                descriptionToUse="name"
              />
              <ReportCard
                actionButtonText="Update Report"
                showReportButton={transactions.length > 0}
                reportData={generatedReportData}
                handleSubmitReport={handleUpdateReport}
                fixedPosition
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
