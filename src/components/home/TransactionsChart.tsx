// import React, { useCallback, useState } from "react";
// import PieChart from "./PieChart";

// // Example transaction data
// const transactions = [
//   {
//     amount: 20,
//     category: "Bills & Utilities",
//     date: "2024-01-15",
//     name: "Electricity Bill",
//   },
//   {
//     amount: 50,
//     category: "Groceries",
//     date: "2024-01-16",
//     name: "Supermarket",
//   },
//   {
//     amount: 100,
//     category: "Entertainment",
//     date: "2024-01-17",
//     name: "Movie Night",
//   },
//   {
//     amount: 150,
//     category: "Bills & Utilities",
//     date: "2024-01-18",
//     name: "Internet Bill",
//   },
//   {
//     amount: 30,
//     category: "Groceries",
//     date: "2024-01-19",
//     name: "Grocery Store",
//   },
// ];

// // Group transactions by category
// const groupedTransactions = transactions.reduce((acc, transaction) => {
//   if (!acc[transaction.category]) {
//     acc[transaction.category] = [];
//   }
//   acc[transaction.category].push(transaction);
//   return acc;
// }, {});

// const categories = Object.keys(groupedTransactions);

// const data = {
//   labels: categories,
//   values: categories.map((category) =>
//     groupedTransactions[category].reduce(
//       (sum, transaction) => sum + transaction.amount,
//       0
//     )
//   ),
//   colors: ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF"],
// };

// const TransactionsChart = () => {
//   const [selectedTransactions, setSelectedTransactions] = useState([]);
//   const [selectedCategory, setSelectedCategory] = useState("");

//   const handleSectionClick = useCallback((index) => {
//     const category = data.labels[index];
//     setSelectedCategory(category);
//     setSelectedTransactions(groupedTransactions[category]);
//   }, []);

//   return (
//     <div>
//       <h1>Transaction Summary</h1>
//       <PieChart data={data} onSectionPress={handleSectionClick} />
//       <h2>Transactions</h2>
//       <p>Selected category: {selectedCategory}</p>
//       <ul>
//         {selectedTransactions.map((transaction, index) => (
//           <li key={index}>
//             {transaction.date}: {transaction.name} - ${transaction.amount}
//           </li>
//         ))}
//       </ul>
//     </div>
//   );
// };

// export default TransactionsChart;
