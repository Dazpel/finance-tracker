"use client";

import React, { useState, use } from "react";
import { useDeviceSize } from "@components/hooks/useDeviceSize";
import ReportCard from "@components/ReportCard/ReportCard";
import TransactionsTable from "@components/TransactionsTable/TransactionsTable";
import { Button, Tab, Tabs } from "@heroui/react";
import {
  decodeQueryString,
  filterTransactions,
  formatCreatedDate,
} from "utils/functions";
import { TransactionWithNotes } from "utils/types";

const noop = () => {};

export default function Page(props: {
  searchParams: Promise<{ data: string }>;
}) {
  const searchParams = use(props.searchParams);
  //todo: abstract generateSelectedCategoryKeys so it can be reused
  const isMobile = useDeviceSize();
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [displayTransactions, setDisplayTransactions] = useState(false);
  const [transactions, setTransactions] = useState([] as TransactionWithNotes[]);
  const [selectedKeys, setSelectedKeys] = useState(new Set([]));
  const reportData = decodeQueryString(searchParams.data);
  const { reportName, createdAt, id, reportType, ...rest } = reportData;

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

    setTransactions(transactions);
    setSelectedKeys(newKeys);
    setDisplayTransactions(true);
  };

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

  const renderTransactionsTable = () =>
    displayTransactions && (
      <TransactionsTable
        tableMode="view"
        generateSelectedCategoryKeys={noop}
        goBack={noop}
        goForward={noop}
        selectedKeys={selectedKeys}
        transactions={transactions}
        updateHistory={noop}
        descriptionToUse="name"
        onEdit={noop}
      />
    );

  const renderReportCard = () => <ReportCard reportData={rest} />;

  const renderTabs = () =>
    isMobile && displayTransactions ? (
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
    <div className="flex flex-col gap-4">
      <h3 className="text-xl font-semibold mb-4">Details</h3>
      <div className="flex flex-col gap-2">
        <p className="font-bold">
          Report Name: <span className="font-normal">{reportName}</span>
        </p>
        <p className="font-bold">
          Created At:{" "}
          <span className="font-normal">{formatCreatedDate(createdAt)}</span>
        </p>
        <Button
          className="w-fit mb-5"
          color="primary"
          isLoading={isLoading}
          isDisabled={isLoading || displayTransactions}
          onPress={() => fetchTransactions()}
        >
          View Transactions
        </Button>
        {isError && <p className="mb-4 text-danger">{errorMessage}</p>}
        <div className="flex flex-col gap-4">{renderTabs()}</div>
      </div>
    </div>
  );
}
