import React, { Suspense } from "react";
import PageLoader from "@components/PageLoader/PageLoader";
import SyncedReportsPage from "./SyncedReportsPage";

// Synced Reports Page - uses synced transactions from database
// This serves as a migration point for future replacement of ReportsPage
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="flex flex-col gap 4">
      <h3 className="text-xl font-semibold mb-4">Synced Reports</h3>
      <Suspense fallback={<PageLoader />}>
        <SyncedReportsPage />
      </Suspense>
    </div>
  );
}

