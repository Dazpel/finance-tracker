import { TransactionStream } from "plaid";

export const getTotalFlowAmount = (transactions: TransactionStream[]) => {
  return transactions.reduce((acc, transaction) => {
    const amount = transaction.last_amount.amount || 0;
    return acc + Math.abs(amount);
  }, 0);
};
