import React from "react";
import TransactionsPage from "./TransactionsPage";
import { getAccessToken } from "utils/functions";

export default async function Page() {
  const res = await getAccessToken();
  return <TransactionsPage isAccessTokenValid={res} />;
}
