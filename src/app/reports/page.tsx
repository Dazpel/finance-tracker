import React, { Suspense } from "react";
import ReportsPage from "./ReportsPage";
import PageLoader from "@components/PageLoader/PageLoader";

// Needs work, doesn't reload data on page change
// Explore react query for this
export const dynamic = "force-dynamic";

export default async function Page() {
  return (
    <div className="flex flex-col gap 4">
      <h3 className="text-xl font-semibold mb-4">Reports</h3>
      <Suspense fallback={<PageLoader />}>
        <ReportsPage />
      </Suspense>
    </div>
  );
}
