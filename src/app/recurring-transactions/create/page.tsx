"use client";

import React, { useMemo, useState } from "react";
import FullScreenOverlay from "@components/Loader/Loader";
import { Button, Input } from "@nextui-org/react";
import axios from "axios";
import { TransactionStream } from "plaid";
import RecurringTransactionsTable from "@components/RecurringTransactionsTable/RecurringTransactionsTable";
import { getTotalFlowAmount } from "../_utils/functions";
import EditRecurringTransactionModal from "@components/EditRecurringTransactionModal/EditRecurringTransactionModal";
import { useRouter } from "next/navigation";

type TransactionFlows = {
  inflows: TransactionStream[];
  outflows: TransactionStream[];
};

type TransactionFlowTotal = {
  inflowTotal: number;
  outflowTotal: number;
};

export type FlowType = "inflows" | "outflows";

function RecurringTransactionsPage() {
    const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [transactions, setTransactions] = useState<TransactionFlows>({inflows: [], outflows: []});
  const [totalFlowAmount, setTotalFlowAmount] = useState<TransactionFlowTotal>({inflowTotal: 0, outflowTotal: 0});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editableTransaction, setEditableTransaction] = useState({} as TransactionStream);
  const [editableFlow, setEditableFlow] = useState<FlowType>("inflows");
  const isButtonDisabled = transactions.inflows.length > 0 || transactions.outflows.length > 0;
  const [reportName, setReportName] = useState("");
  const [isReportNameValid, setIsReportNameValid] = useState(true);

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
    setEditableTransaction(transactions[type].find((t) => t.stream_id === stream_id) as TransactionStream);
    setEditableFlow(type);
    setIsModalOpen(true);
  }

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
      last_date: chargeDay > "31" ? '2024-01-31' : `2024-01-${chargeDay}`,
      last_amount: {
        amount: Number((formValues[2] as HTMLInputElement)?.value),
      }
    };

    prevTransactions[transactionIndex] = updatedTransaction;
    updateTransactions(prevTransactions, editableFlow);
    setIsModalOpen(false);
  };

  const generatedReportData = useMemo(() => {
    let inflow = 0;
    let outflow = 0;

    const inflowTransactions = transactions.inflows.map((transaction) => {
        inflow += Math.abs(transaction.last_amount.amount || 0);
        return {
            account_id: transaction.account_id,
            stream_id: transaction.stream_id,
            description: transaction.description,
            amount: transaction.last_amount.amount,
            last_date: transaction.last_date,
            frequency: transaction.frequency
        };
    });

    const outflowTransactions = transactions.outflows.map((transaction) => {
        outflow += Math.abs(transaction.last_amount.amount || 0);
        return {
            account_id: transaction.account_id,
            stream_id: transaction.stream_id,
            description: transaction.description,
            amount: transaction.last_amount.amount,
            last_date: transaction.last_date,
            frequency: transaction.frequency
        };
    });

    return {
      inflow,
      outflow,
      inflowTransactions,
      outflowTransactions,
      total: Math.abs(inflow - outflow).toFixed(2),
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
        onClick={getTransactionData}
        disabled={isButtonDisabled}
        color="primary"
        variant="solid"
      >
        Fetch Transactions
      </Button>
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
          <span>Total outflows: {totalFlowAmount.outflowTotal} </span>
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
          <span>Total inflows: {totalFlowAmount.inflowTotal} </span>
          <RecurringTransactionsTable
            transactions={transactions.inflows}
            onUpdate={updateTransactions}
            onEdit={handleEdit}
            flowType="inflows"
          />
        </div>
      )}
      <div className="flex mt-4 justify-end">
        <Button color="primary" onClick={handleSubmitReport}>
            {isLoading ? "Submitting..." : "Submit Report"}
        </Button>
      </div>
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
