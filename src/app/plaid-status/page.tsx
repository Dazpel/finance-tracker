import React from "react";
import PlaidStatusPage from "./PlaidStatusPage";

export default function Page() {
  return (
    <div className="h-full">
      <h3 className="text-xl font-semibold mb-4">Connection Health</h3>
      <PlaidStatusPage />
    </div>
  );
}
