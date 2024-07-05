import React, { Suspense } from "react";
import AccountsPage from "./AccountsPage";
import PageLoader from "@components/PageLoader/PageLoader";

export default function Page() {
  return (
    <div className="h-full">
      <h3 className="text-xl font-semibold mb-4">Current conected accounts</h3>
      <Suspense fallback={<PageLoader />}>
        <AccountsPage />
      </Suspense>
    </div>
  );
}
