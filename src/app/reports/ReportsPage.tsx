"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import ReportsTable from "@components/ReportsTable/ReportsTable";
import { ReportDataDTO } from "utils/types";

export type ReportsPageProps = {
  reportData: ReportDataDTO[];
};

export default function ReportsPage({ reportData }: ReportsPageProps) {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleOnEdit = (encodedURI: string): void => {
    router.push(`/reports/edit?data=${encodedURI}`);
  }

  const handleOnView = (encodedURI: string): void => {
    router.push(`/reports/details?data=${encodedURI}`);
  };

  const handleOnCompare = (encodedURI: string): void => {
    router.push(`/reports/compare?data=${encodedURI}`);
  };

  const handleOnDelete = async (reportId: number): Promise<void> => {
    const response = await fetch("/api/prisma/reports/delete", {
      method: "POST",
      body: JSON.stringify({ reportId }),
    });
    const data = await response.json();
    if (data.success) {
      return router.refresh();
    }
    setError(true);
    setErrorMessage("Error deleting report");
  };

  return (
    <div className="flex flex-col gap 4">
      <h3 className="text-xl font-semibold mb-4">Reports</h3>
      {error && <p className="mb-4 text-danger">{errorMessage}</p>}
      {reportData.length > 0 ? (
        <ReportsTable
          reportData={reportData}
          handleOnEdit={handleOnEdit}
          handleOnView={handleOnView}
          handleOnCompare={handleOnCompare}
          handleOnDelete={handleOnDelete}
        />
      ) : (
        <p>No reports found</p>
      )}
    </div>
  );
}
