"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import ReportsTable from "@components/ReportsTable/ReportsTable";
import { ReportDataDTO } from "utils/types";
import FullScreenOverlay from "@components/Loader/Loader";

export type ReportsPageProps = {
  reportData: ReportDataDTO[];
};

export default function ReportsPage({ reportData }: ReportsPageProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleOnEdit = (encodedURI: string): void => {
    setIsLoading(true);
    router.push(`/reports/edit?data=${encodedURI}`);
  };

  const handleOnView = (encodedURI: string): void => {
    setIsLoading(true);
    router.push(`/reports/details?data=${encodedURI}`);
  };

  const handleOnCompare = (encodedURI: string): void => {
    setIsLoading(true);
    router.push(`/reports/compare?data=${encodedURI}`);
  };

  const handleOnDelete = async (reportId: number): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/prisma/reports/delete", {
        method: "POST",
        body: JSON.stringify({ reportId }),
      });
      const data = await response.json();
      if (data.success) {
        setIsLoading(false);
        return router.refresh();
      }
      setIsLoading(false);
    } catch {
      setError(true);
      setErrorMessage("Error deleting report");
    }
  };

  const handleMerge = async (
    reportId_1: number,
    reportId_2: number
  ): Promise<void> => {
    try {
      setIsLoading(true);

      const response = await fetch("/api/prisma/reports/merge", {
        method: "POST",
        body: JSON.stringify({ reportId_1, reportId_2 }),
      });

      const data = await response.json();
      if (data.success) {
        setIsLoading(false);
        return router.refresh();
      }
      setIsLoading(false);
    } catch {
      setIsLoading(false);
      setError(true);
      setErrorMessage("Error merging reports");
    }
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
          handleMerge={handleMerge}
        />
      ) : (
        <p>No reports found</p>
      )}
      {isLoading && <FullScreenOverlay />}
    </div>
  );
}
