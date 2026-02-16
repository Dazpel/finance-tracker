"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import ReportsTable from "@components/ReportsTable/ReportsTable";
import FullScreenOverlay from "@components/Loader/Loader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageLoader from "@components/PageLoader/PageLoader";
import { ReportDataDTO } from "utils/types";
import { ReportType } from "@prisma/client";

export default function ReportsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const { isPending, data } = useQuery({
    queryKey: ["reportsData"],
    queryFn: async () => {
      const response = await fetch("/api/reports/getReports");
      const data = await response.json();
      return data?.reportData || [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (reportId: number) => {
      const response = await fetch("/api/prisma/reports/delete", {
        method: "POST",
        body: JSON.stringify({ reportId }),
      });
      const data = await response.json();
      if (!data.success) throw new Error("Failed to delete report");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportsData"] });
      setSelectionResetKey((k) => k + 1);
    },
    onError: () => {
      setError(true);
      setErrorMessage("Error deleting report");
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({
      reportId_1,
      reportId_2,
    }: {
      reportId_1: number;
      reportId_2: number;
    }) => {
      const response = await fetch("/api/prisma/reports/merge", {
        method: "POST",
        body: JSON.stringify({ reportId_1, reportId_2 }),
      });
      const data = await response.json();
      if (!data.success) throw new Error("Failed to merge reports");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportsData"] });
      setSelectionResetKey((k) => k + 1);
    },
    onError: () => {
      setError(true);
      setErrorMessage("Error merging reports");
    },
  });

  const createAnnualMutation = useMutation({
    mutationFn: async ({
      reportIds,
      reportName,
      reports,
    }: {
      reportIds: number[];
      reportName: string;
      reports: ReportDataDTO[];
    }) => {
      const response = await fetch("/api/prisma/reports/create-anual", {
        method: "POST",
        body: JSON.stringify({ reportIds, reportName, reports }),
      });
      const data = await response.json();
      if (!data.success) throw new Error("Failed to create annual report");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportsData"] });
      setSelectionResetKey((k) => k + 1);
    },
    onError: () => {
      setError(true);
      setErrorMessage("Error creating annual report");
    },
  });

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

  const handleOnInsights = (reportId: number, reportType: string): void => {
    setIsLoading(true);
    router.push(`/insights?reportId=${reportId}&reportType=${reportType}`);
  };

  const handleOnDelete = async (reportId: number): Promise<void> => {
    try {
      await deleteMutation.mutateAsync(reportId);
    } catch {
      // Error handled in onError
    }
  };

  const handleMerge = async (
    reportId_1: number,
    reportId_2: number
  ): Promise<void> => {
    try {
      await mergeMutation.mutateAsync({ reportId_1, reportId_2 });
    } catch {
      // Error handled in onError
    }
  };

  const filterMonthlyReports = (reports: ReportDataDTO[]) => {
    return reports.filter((report) => report.reportType === ReportType.MONTHLY);
  };

  const filterAnnualReports = (reports: ReportDataDTO[]) => {
    return reports.filter((report) => report.reportType === ReportType.ANNUAL);
  };

  const handleAnnualReport = async (
    reportIds: number[],
    reportName: string,
    reports: ReportDataDTO[]
  ): Promise<void> => {
    try {
<<<<<<< feat/enable-transaction-sync
      setIsLoading(true);
      const response = await fetch("/api/prisma/reports/create-annual", {
        method: "POST",
        body: JSON.stringify({ reportIds, reportName, reports }),
=======
      await createAnnualMutation.mutateAsync({
        reportIds,
        reportName,
        reports,
>>>>>>> main
      });
    } catch {
      // Error handled in onError
    }
  };

  return (
    <>
      {isPending && <PageLoader />}
      {!isPending && (
        <div className="flex flex-col gap-4">
          <ReportsTable
            reportData={filterMonthlyReports(data).reverse() || []}
            handleOnEdit={handleOnEdit}
            handleOnView={handleOnView}
            handleOnCompare={handleOnCompare}
            handleOnDelete={handleOnDelete}
            handleAnnualReport={handleAnnualReport}
            handleMerge={handleMerge}
            handleOnInsights={handleOnInsights}
            showCreateAnnualReportHeader
            isDeletePending={deleteMutation.isPending}
            isMergePending={mergeMutation.isPending}
            isCreateAnnualPending={createAnnualMutation.isPending}
            selectionResetKey={selectionResetKey}
          />
          <h3 className="text-xl font-semibold mt-4">Annual Reports</h3>
          <ReportsTable
            reportType="annual"
            reportData={filterAnnualReports(data).reverse() || []}
            handleOnEdit={handleOnEdit}
            handleOnView={handleOnView}
            handleOnCompare={handleOnCompare}
            handleOnDelete={handleOnDelete}
            handleMerge={handleMerge}
            handleAnnualReport={handleAnnualReport}
            handleOnInsights={handleOnInsights}
            disableHeader
            isDeletePending={deleteMutation.isPending}
            isMergePending={mergeMutation.isPending}
            isCreateAnnualPending={createAnnualMutation.isPending}
            selectionResetKey={selectionResetKey}
          />
        </div>
      )}
      {isLoading && <FullScreenOverlay />}
    </>
  );
}
