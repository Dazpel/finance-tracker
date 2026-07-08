"use client";

import { useState, use } from "react";
import { useDeviceSize } from "@components/hooks/useDeviceSize";
import FullScreenOverlay from "@components/Loader/Loader";
import ReportCard from "@components/ReportCard/ReportCard";
import TransactionsTable from "@components/TransactionsTable/TransactionsTable";
import ApproveReportModal from "@components/ApproveReportModal/ApproveReportModal";
import { Button, Tab, Tabs, useDisclosure } from "@heroui/react";
import { useNavigateWithPending } from "@hooks/useNavigateWithPending";
import { useToast } from "@hooks/useToast";
import {
  decodeQueryString,
  filterTransactions,
  formatCreatedDate,
} from "utils/functions";
import { TransactionWithNotes } from "utils/types";
import { formatMonthLabel } from "./_utils/constants";
import { approveReport } from "./_utils/api";

const noop = () => {};

export default function Page(props: {
  searchParams: Promise<{ data: string }>;
}) {
  const searchParams = use(props.searchParams);
  //todo: abstract generateSelectedCategoryKeys so it can be reused
  const isMobile = useDeviceSize();
  const { navigate, isPending: isNavigating } = useNavigateWithPending();
  const { successToast, errorToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [displayTransactions, setDisplayTransactions] = useState(false);
  const [transactions, setTransactions] = useState([] as TransactionWithNotes[]);
  const [selectedKeys, setSelectedKeys] = useState(new Set([]));
  const [isApproving, setIsApproving] = useState(false);
  const { isOpen: isConfirmOpen, onOpen: openConfirm, onClose: closeConfirm } = useDisclosure();
  const reportData = decodeQueryString(searchParams.data);
  const { reportName, createdAt, id, reportType, status, month, year,
    foodAndDrink, billsAndUtilities, car, entertainment, groceries,
    charity, healthAndWellness, personal, shopping, feesAndAdjustments, others,
    revenue, expenses, total } = reportData;
  const rest = { foodAndDrink, billsAndUtilities, car, entertainment, groceries, charity, healthAndWellness, personal, shopping, feesAndAdjustments, others, revenue, expenses, total };
  const monthLabel = formatMonthLabel(month, year, reportName);
  const canApprove = status === "PENDING_APPROVAL" && reportType === "MONTHLY";

  const handleApprove = async () => {
    setIsApproving(true);
    const result = await approveReport(id);
    if (!result.ok) {
      errorToast(result.error);
      setIsApproving(false);
      // 409 = already approved (e.g., another tab beat us). Drop back to
      // /reports so the list refetches the corrected status.
      if (result.status === 409) {
        closeConfirm();
        navigate("/reports");
      }
      return;
    }
    successToast(`Report approved (${result.transactionsAdded} transactions locked)`);
    closeConfirm();
    navigate("/reports");
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
        <div className="flex gap-2 mb-5">
          <Button
            className="w-fit"
            color="primary"
            isLoading={isLoading}
            isDisabled={isLoading || displayTransactions}
            onPress={() => fetchTransactions()}
          >
            View Transactions
          </Button>
          {reportType !== "ANNUAL" && (
            <Button
              className="w-fit"
              color="primary"
              variant="bordered"
              onPress={() => navigate(`/reports/edit?data=${searchParams.data}`)}
            >
              Edit
            </Button>
          )}
          {canApprove && (
            <Button
              className="w-fit"
              color="success"
              isLoading={isApproving}
              onPress={openConfirm}
            >
              Approve & Lock
            </Button>
          )}
        </div>
        {isError && <p className="mb-4 text-danger">{errorMessage}</p>}
        <div className="flex flex-col gap-4">{renderTabs()}</div>
      </div>
      <ApproveReportModal
        isOpen={isConfirmOpen}
        onClose={closeConfirm}
        onConfirm={handleApprove}
        monthLabel={monthLabel}
        isSubmitting={isApproving}
      />
      {isNavigating && <FullScreenOverlay />}
    </div>
  );
}
