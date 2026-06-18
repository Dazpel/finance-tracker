"use client";

import React, { useState } from "react";
import ReportsTable from "@components/ReportsTable/ReportsTable";
import FullScreenOverlay from "@components/Loader/Loader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageLoader from "@components/PageLoader/PageLoader";
import { useNavigateWithPending } from "@hooks/useNavigateWithPending";
import { ReportDataDTO } from "utils/types";
import { ReportType, ReportStatus } from "@prisma/client";

export default function ReportsPage() {
  const { navigate, isPending: isNavigating } = useNavigateWithPending();
  const queryClient = useQueryClient();
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
    mutationFn: async (reportId: string) => {
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
      reportId_1: string;
      reportId_2: string;
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
      reportIds: string[];
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

  const handleOnEdit = (encodedURI: string): void =>
    navigate(`/reports/edit?data=${encodedURI}`);

  const handleOnView = (encodedURI: string): void =>
    navigate(`/reports/details?data=${encodedURI}`);

  const handleOnCompare = (encodedURI: string): void =>
    navigate(`/reports/compare?data=${encodedURI}`);

  const handleOnInsights = (reportId: string, reportType: string): void =>
    navigate(`/insights?reportId=${reportId}&reportType=${reportType}`);

  const handleOnDelete = async (reportId: string): Promise<void> => {
    try {
      await deleteMutation.mutateAsync(reportId);
    } catch {
      // Error handled in onError
    }
  };

  const handleMerge = async (
    reportId_1: string,
    reportId_2: string
  ): Promise<void> => {
    try {
      await mergeMutation.mutateAsync({ reportId_1, reportId_2 });
    } catch {
      // Error handled in onError
    }
  };

  const isApproved = (report: ReportDataDTO) =>
    !report.status || report.status === ReportStatus.APPROVED;

  const filterPendingReports = (reports: ReportDataDTO[]) => {
    return reports.filter(
      (report) =>
        report.reportType === ReportType.MONTHLY && !isApproved(report)
    );
  };

  const filterMonthlyReports = (reports: ReportDataDTO[]) => {
    return reports.filter(
      (report) =>
        report.reportType === ReportType.MONTHLY && isApproved(report)
    );
  };

  const filterAnualReports = (reports: ReportDataDTO[]) => {
    return reports.filter((report) => report.reportType === ReportType.ANNUAL);
  };

  const handleAnualReport = async (
    reportIds: string[],
    reportName: string,
    reports: ReportDataDTO[]
  ): Promise<void> => {
    try {
      await createAnnualMutation.mutateAsync({
        reportIds,
        reportName,
        reports,
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
          {filterPendingReports(data).length > 0 && (
            <>
              <h3 className="text-xl font-semibold">Pending Review</h3>
              <p className="text-sm text-default-500 -mt-2">
                Auto-generated from your Plaid transactions. Review and approve once the month has ended.
              </p>
              <ReportsTable
                reportData={filterPendingReports(data).reverse()}
                handleOnEdit={handleOnEdit}
                handleOnView={handleOnView}
                handleOnCompare={handleOnCompare}
                handleOnDelete={handleOnDelete}
                handleAnnualReport={handleAnualReport}
                handleMerge={handleMerge}
                handleOnInsights={handleOnInsights}
                disableHeader
                isDeletePending={deleteMutation.isPending}
                isMergePending={mergeMutation.isPending}
                isCreateAnnualPending={createAnnualMutation.isPending}
                selectionResetKey={selectionResetKey}
              />
              <h3 className="text-xl font-semibold mt-4">Monthly Reports</h3>
            </>
          )}
          <ReportsTable
            reportData={filterMonthlyReports(data).reverse() || []}
            handleOnEdit={handleOnEdit}
            handleOnView={handleOnView}
            handleOnCompare={handleOnCompare}
            handleOnDelete={handleOnDelete}
            handleAnnualReport={handleAnualReport}
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
            reportType="anual"
            reportData={filterAnualReports(data).reverse() || []}
            handleOnEdit={handleOnEdit}
            handleOnView={handleOnView}
            handleOnCompare={handleOnCompare}
            handleOnDelete={handleOnDelete}
            handleMerge={handleMerge}
            handleAnnualReport={handleAnualReport}
            handleOnInsights={handleOnInsights}
            disableHeader
            isDeletePending={deleteMutation.isPending}
            isMergePending={mergeMutation.isPending}
            isCreateAnnualPending={createAnnualMutation.isPending}
            selectionResetKey={selectionResetKey}
          />
        </div>
      )}
      {isNavigating && <FullScreenOverlay />}
    </>
  );
}
