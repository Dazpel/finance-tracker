import { TransactionStream } from "plaid";

export const defaultColumns = [
  {
    key: "description",
    label: "DESCRIPTION",
  },
  {
    key: "amount",
    label: "AMOUNT",
  },
  {
    key: "frequency",
    label: "FREQUENCY",
  },
  {
    key: "day",
    label: "DAY",
  },
  {
    key: "actions",
    label: "ACTIONS",
  },
];

export type TableRowType = {
  key: string;
  description: string;
  amount: number;
  frequency: string;
  day: string;
};

export const rows = (transactions: TransactionStream[], viewMode: boolean = false): TableRowType[] => {
  const amountField = viewMode ? "amount" : "last_amount.amount";
  return transactions.map((transaction) => ({
    key: transaction.stream_id,
    day: transaction.last_date,
    description: transaction.description,
    // @ts-ignore
    amount: Number((transaction[amountField] || 0).toFixed(2)),
    frequency: transaction.frequency,
  }));
};