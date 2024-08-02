import { TransactionStream } from "plaid";

export const defaultColumns = [
  {
    key: "description",
    label: "DESCRIPTION",
  },
  {
    key: "category",
    label: "CATEGORY",
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
    key: "lastPayment",
    label: "LAST PAYMENT",
  },
];

export type TableRowType = {
  key: string;
  description: string;
  category: string;
  amount: number;
  frequency: string;
  lastPayment: string;
};

export const rows = (transactions: TransactionStream[]): TableRowType[] => {
  return transactions.map((transaction) => ({
    key: transaction.stream_id,
    lastPayment: transaction.last_date,
    description: transaction.description,
    category: transaction.category ? transaction.category[0] : "",
    amount: Number((transaction.last_amount?.amount || 0).toFixed(2)),
    frequency: transaction.frequency,
  }));
};