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
  return transactions.map((transaction) => {
      // @ts-ignore
    const amount = viewMode ? transaction.amount : transaction.last_amount.amount;

    return {
      key: transaction.stream_id,
      day: transaction.last_date,
      description: transaction.description,
      amount: Number((amount || 0).toFixed(2)),
      frequency: transaction.frequency,
    }
  });
};