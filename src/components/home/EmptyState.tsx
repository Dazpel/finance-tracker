"use client";

import React from "react";
import { Card, CardBody } from "@heroui/react";
import PlaidButton from "@components/PlaidButton/PlaidButton";

type EmptyStateProps = {
  firstName: string | null;
};

export const EmptyState = ({ firstName }: EmptyStateProps) => (
  <div className="flex h-full items-center justify-center">
    <Card shadow="sm" className="max-w-lg w-full">
      <CardBody className="items-center gap-3 px-8 py-10 text-center">
        <span className="text-4xl" aria-hidden="true">
          👁️
        </span>
        <h1 className="text-xl font-semibold tracking-tight">
          {firstName ? `Welcome, ${firstName}!` : "Welcome to MoneyEye!"} Connect your first account
        </h1>
        <p className="max-w-sm text-sm text-default-500">
          Link a bank and MoneyEye instantly shows your cash flow, spotted subscriptions, and
          where your money goes — no manual entry.
        </p>
        <div className="mt-2 flex justify-center">
          <PlaidButton />
        </div>
      </CardBody>
    </Card>
  </div>
);
