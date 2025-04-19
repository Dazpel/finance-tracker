"use client";

import React, { useMemo, useState } from "react";
import FullScreenOverlay from "@components/Loader/Loader";
import { Button, Input } from "@heroui/react";
import axios from "axios";
import { TransactionStream } from "plaid";
import RecurringTransactionsTable from "@components/RecurringTransactionsTable/RecurringTransactionsTable";
import EditRecurringTransactionModal from "@components/EditRecurringTransactionModal/EditRecurringTransactionModal";
import { useRouter } from "next/navigation";

type TransactionFlows = {
  inflows: TransactionStream[];
  outflows: TransactionStream[];
};

export type FlowType = "inflows" | "outflows";

function RecurringTransactionsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [transactions, setTransactions] = useState<TransactionFlows>({
    inflows: [],
    outflows: [],
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editableTransaction, setEditableTransaction] = useState({} as TransactionStream);
  const [editableFlow, setEditableFlow] = useState<FlowType>("inflows");
  const isButtonDisabled = transactions.inflows.length > 0 || transactions.outflows.length > 0;
  const [reportName, setReportName] = useState("");
  const [isReportNameValid, setIsReportNameValid] = useState(true);
  const displayTransactions = transactions.inflows.length > 0 || transactions.outflows.length > 0;

  const getTransactionData = async () => {
    setIsError(false);
    setErrorMessage("");

    try {
      setIsLoading(true);
      const res = await axios.get("/api/plaid/getRecurringTransactions");

      setTransactions({
        inflows: res.data.inflows,
        outflows: res.data.outflows,
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

  const updateTransactions = async (
    updatedTransactions: TransactionStream[],
    type: FlowType
  ) => {
    if (type === "inflows") {
      setTransactions({
        inflows: updatedTransactions,
        outflows: transactions.outflows,
      });
    }

    if (type === "outflows") {
      setTransactions({
        inflows: transactions.inflows,
        outflows: updatedTransactions,
      });
    }
  };

  const handleEdit = (stream_id: string, type: FlowType) => {
    setEditableTransaction(
      transactions[type].find(
        (t) => t.stream_id === stream_id
      ) as TransactionStream
    );
    setEditableFlow(type);
    setIsModalOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formValues = e.target as HTMLFormElement;
    const prevTransactions = [...transactions[editableFlow]];
    const streamId = editableTransaction.stream_id;

    const transactionIndex = prevTransactions.findIndex(
      (transaction) => transaction.stream_id === streamId
    );

    const chargeDay = (formValues[1] as HTMLInputElement)?.value;

    const updatedTransaction = {
      ...editableTransaction,
      description: (formValues[0] as HTMLInputElement)?.value,
      last_date: chargeDay > "31" ? "2024-01-31" : `2024-01-${chargeDay}`,
      last_amount: {
        amount: Number((formValues[2] as HTMLInputElement)?.value),
      },
    };

    prevTransactions[transactionIndex] = updatedTransaction;
    updateTransactions(prevTransactions, editableFlow);
    setIsModalOpen(false);
  };

  const generatedReportData = useMemo(() => {
    const processTransactions = (transactions: any[]) => {
      return transactions.reduce(
        (acc, transaction) => {
          const amount = Math.abs(transaction.last_amount.amount || 0).toFixed(2);
          acc.total += Number(amount);

          acc.transactions.push({
            account_id: transaction.account_id,
            stream_id: transaction.stream_id,
            description: transaction.description,
            amount: transaction.last_amount.amount,
            last_date: transaction.last_date,
            frequency: transaction.frequency,
          });
          return acc;
        },
        { total: 0, transactions: [] }
      );
    };
  
    const inflowData = processTransactions(transactions.inflows);
    const outflowData = processTransactions(transactions.outflows);
  
    return {
      inflow: inflowData.total,
      outflow: outflowData.total,
      inflowTransactions: inflowData.transactions,
      outflowTransactions: outflowData.transactions,
      total: Math.abs(inflowData.total - outflowData.total).toFixed(2),
    };
  }, [transactions]);

  const handleSubmitReport = async () => {
    setIsError(false);
    setErrorMessage("");

    if (!isReportNameValid || reportName.length === 0) {
      setErrorMessage("Please enter a report name");
      setIsError(true);
      return;
    }

    try {
      setIsLoading(true);
      const body = {
        transactions,
        reportData: generatedReportData,
        reportName,
      };

      const res = await axios.post("/api/prisma/recurringReports/create", body);
      if (!res.data.success) {
        setIsLoading(false);
        setErrorMessage("Error submitting report");
        return setIsError(true);
      }
      setIsLoading(false);
      router.push("/recurring-transactions");
    } catch (error) {
      setIsLoading(false);
      setIsError(true);
      setErrorMessage("Error submitting report");
    }
  };

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

  return (
    <div className="h-inherit">
      {isError && <p className="mb-4 text-danger">{errorMessage}</p>}
      <Button
        onPress={getTransactionData}
        disabled={isButtonDisabled}
        color="primary"
        variant="solid"
      >
        Fetch Transactions
      </Button>
      {displayTransactions && (
        <div className="flex flex-col gap-4">
          <Input
            type="text"
            label="Report name"
            placeholder="Enter a report name"
            className="w-fit mt-8"
            value={reportName}
            isInvalid={!isReportNameValid}
            errorMessage={!isReportNameValid && "Please enter a report name"}
            onChange={handleReportNameChange}
          />
          {transactions.outflows.length > 0 && (
            <div className="flex flex-col gap-4 mt-2">
              <p className="font-bold">
                Total outflows: <span className="font-normal">{generatedReportData.outflow}</span>
              </p>
              <RecurringTransactionsTable
                transactions={transactions.outflows}
                onUpdate={updateTransactions}
                onEdit={handleEdit}
                flowType="outflows"
              />
            </div>
          )}
          {transactions.inflows.length > 0 && (
            <div className="flex flex-col gap-4 mt-8">
              <p className="font-bold">
                Total inflows: <span className="font-normal">{generatedReportData.inflow}</span>
              </p>
              <RecurringTransactionsTable
                transactions={transactions.inflows}
                onUpdate={updateTransactions}
                onEdit={handleEdit}
                flowType="inflows"
              />
            </div>
          )}
          <div className="flex mt-4 justify-end">
            <Button color="primary" onPress={handleSubmitReport}>
              {isLoading ? "Submitting..." : "Submit Report"}
            </Button>
          </div>
        </div>
      )}
      {isLoading && <FullScreenOverlay />}
      <EditRecurringTransactionModal
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        editableTransaction={editableTransaction}
        handleEditSubmit={handleEditSubmit}
      />
    </div>
  );
}

export default RecurringTransactionsPage;
