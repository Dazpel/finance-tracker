"use client";

import ReportCard from "@components/ReportCard/ReportCard";
import TransactionsTable from "@components/TransactionsTable/TransactionsTable";
import { Button } from "@nextui-org/react";
import { TransactionBase } from "plaid";
import React, { useState } from "react";
import { decodeQueryString, formatCreatedDate } from "utils/functions";

const noop = () => {};

export default function Page({
  searchParams,
}: {
  searchParams: { data: string };
}) {
  //todo: abstract generateSelectedCategoryKeys so it can be reused
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [displayTransactions, setDisplayTransactions] = useState(false);
  const [transactions, setTransactions] = useState([] as TransactionBase[]);
  const [selectedKeys, setSelectedKeys] = useState(new Set([]));
  const reportData = decodeQueryString(searchParams.data);
  const { reportName, createdAt, id, ...rest } = reportData;

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

    setTransactions(transactions);
    setSelectedKeys(newKeys);
    setDisplayTransactions(true);
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
          onClick={() => fetchTransactions()}
        >
          View Transactions
        </Button>
        {isError && <p className="mb-4 text-danger">{errorMessage}</p>}
        <div className="flex gap-4">
          {displayTransactions && (
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
          )}
          <ReportCard reportData={rest} />
        </div>
      </div>
    </div>
  );
}
