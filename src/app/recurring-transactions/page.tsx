import React, { Suspense } from "react";
import PageLoader from "@components/PageLoader/PageLoader";
import RecurringTransactionsPage from "./RecurringTransactionsPage";

export default function Page() {
  return (
    <div className="flex flex-col gap 4">
      <h3 className="text-xl font-semibold mb-4">Recurring Transactions</h3>
      <Suspense fallback={<PageLoader />}>
        <RecurringTransactionsPage />
      </Suspense>
    </div>
  );
}
