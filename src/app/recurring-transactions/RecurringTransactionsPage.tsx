"use client";

import React, { useState } from "react";
import FullScreenOverlay from "@components/Loader/Loader";
import { useQuery } from "@tanstack/react-query";
import PageLoader from "@components/PageLoader/PageLoader";
import RecurringReportsTable from "@components/RecurringReportsTable/RecurringReportsTable";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { useNavigateWithPending } from "@hooks/useNavigateWithPending";

export type FlowType = "inflows" | "outflows";

function RecurringTransactionsPage() {
  const router = useRouter();
  const { navigate, isPending: isNavigating } = useNavigateWithPending();
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const { isPending, isError, data } = useQuery({
    queryKey: ["recurringReportsData"],
    queryFn: async () => {
      const response = await fetch("/api/reports/getReports?recurring=true");
      const data = await response.json();
      return data?.reportData || [];
    },
  });

  const handleOnEdit = (encodedURI: string): void =>
    navigate(`/recurring-transactions/edit?data=${encodedURI}`);

  const handleOnView = (encodedURI: string): void =>
    navigate(`/recurring-transactions/details?data=${encodedURI}`);

  const handleOnDelete = async (reportId: string): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/prisma/recurringReports/delete", {
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

  return (
    <>
      {isPending && <PageLoader />}
      {!isPending && (
        <div className="flex flex-col gap-4">
          <RecurringReportsTable
            reportData={data || []}
            handleOnEdit={handleOnEdit}
            handleOnView={handleOnView}
            handleOnDelete={handleOnDelete}
          />
          <Button className="w-fit" onPress={() => navigate("/recurring-transactions/create")} color="primary">
            Create New Report
          </Button>
        </div>
      )}
      {(isLoading || isNavigating) && <FullScreenOverlay />}
    </>
  );
}

export default RecurringTransactionsPage;
