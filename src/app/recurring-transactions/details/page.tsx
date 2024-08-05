"use client";

import React from "react";
import PageLoader from "@components/PageLoader/PageLoader";
import RecurringTransactionsTable from "@components/RecurringTransactionsTable/RecurringTransactionsTable";
import { useQuery } from "@tanstack/react-query";
import { decodeQueryString, formatCreatedDate } from "utils/functions";

const noop = () => {};

export default function Page({
  searchParams,
}: {
  searchParams: { data: string };
}) {
  const reportData = decodeQueryString(searchParams.data);
  const { reportName, createdAt, id, inflow, outflow } = reportData;

  const { isPending, isError, data } = useQuery({
    queryKey: ["recurringTransactionsData"],
    queryFn: async () => {
      const response = await fetch(
        `/api/prisma/transactions/getRecurring?reportId=${id}`
      );
      const res = await response.json();

      return res?.response?.data || [];
    },
  });

  if (isPending) {
    return <PageLoader />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xl font-semibold mb-4">Details</h3>
      <div className="flex flex-col gap-2">
        <p className="font-bold">
          Report Name: <span className="font-normal">{reportName}</span>
        </p>
        <p className="font-bold">
          Created At:{" "}
          <span className="font-normal">{formatCreatedDate(createdAt)}</span>
        </p>
        {isError && <p className="mb-4 text-danger">There was an error fetching details</p>}
        <div className="flex flex-col gap-4">
          {data?.outflowTransactions.length > 0 && (
            <div className="flex flex-col gap-4 mt-2">
              <p className="font-bold">
                Monthly outflows: <span className="font-normal">{outflow}</span>
              </p>
              <RecurringTransactionsTable
                transactions={data.outflowTransactions}
                onUpdate={noop}
                onEdit={noop}
                tableMode="view"
                flowType="outflows"
              />
            </div>
          )}
          {data?.inflowTransactions.length > 0 && (
            <div className="flex flex-col gap-4 mt-8">
              <p className="font-bold">
                Monthly inflows: <span className="font-normal">{inflow}</span>
              </p>
              <RecurringTransactionsTable
                transactions={data.inflowTransactions}
                onUpdate={noop}
                onEdit={noop}
                tableMode="view"
                flowType="inflows"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
