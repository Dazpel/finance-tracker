import React, { Suspense } from "react";
import TransactionsPage from "./TransactionsPage";
import PageLoader from "@components/PageLoader/PageLoader";

export default function Page() {
  return (
    <div className="h-full">
      <h3 className="text-xl font-semibold mb-4">Transactions</h3>
      <Suspense fallback={<PageLoader />}>
        <TransactionsPage />
      </Suspense>
    </div>
  );
}
