"use client";

import React, { useState } from "react";
import FullScreenOverlay from "@components/Loader/Loader";
import { Button } from "@nextui-org/react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { TransactionStream } from "plaid";
import RecurringTransactionsTable from "@components/RecurringTransactionsTable/RecurringTransactionsTable";
import { getTotalFlowAmount } from "./_utils/functions";

type TransactionFlows = {
    inflows: TransactionStream[];
    outflows: TransactionStream[];
};

type TransactionFlowTotal = {
    inflowTotal: number;
    outflowTotal: number;
};

function RecurringTransactionsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [transactions, setTransactions] = useState<TransactionFlows>({ inflows: [], outflows: [] });
  const [totalFlowAmount, setTotalFlowAmount] = useState<TransactionFlowTotal>({ inflowTotal: 0, outflowTotal: 0 });
  const isButtonDisabled = transactions.inflows.length > 0 || transactions.outflows.length > 0;

  const { isPending, data: isValid } = useQuery({
    queryKey: ["accessTokenValid"],
    queryFn: async () => {
      const response = await fetch("/api/accessToken/checkValid");
      const data = await response.json();
      return data?.isAccessTokenValid || false;
    },
  });

  const getTransactionData = async () => {
    setIsError(false);
    setErrorMessage("");

    try {
      setIsLoading(true);
      const res = await axios.get("/api/plaid/getRecurringTransactions");

      setTransactions({
        inflows: res.data.inflows,
        outflows: res.data.outflows,
      })

      setTotalFlowAmount({
        inflowTotal: getTotalFlowAmount(res.data.inflows),
        outflowTotal: getTotalFlowAmount(res.data.outflows),
      });

      setIsLoading(false);
    } catch (e) {
      console.error({ e });
      setErrorMessage(
        "Error fetching transactions, check your bank connections and try again."
      );
      setIsError(true);
      setIsLoading(false);
    }
  };

  return (
    <div className="h-inherit">
      {isError && <p className="mb-4 text-danger">{errorMessage}</p>}
      <Button
        onClick={getTransactionData}
        disabled={isPending || isButtonDisabled}
        color="primary"
        variant="solid"
      >
        Fetch Transactions
      </Button>
      {transactions.outflows.length > 0 && (
        <div className="flex flex-col gap-4 mt-8">
          <span>Total outflows: {totalFlowAmount.outflowTotal} </span>
          <RecurringTransactionsTable transactions={transactions.outflows} />
        </div>
      )}
        {transactions.inflows.length > 0 && (
            <div className="flex flex-col gap-4 mt-8">
            <span>Total inflows: {totalFlowAmount.inflowTotal} </span>
            <RecurringTransactionsTable transactions={transactions.inflows} />
            </div>
        )}
      {isLoading && <FullScreenOverlay />}
    </div>
  );
}

export default RecurringTransactionsPage;
