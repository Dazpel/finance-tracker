"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import ReportCard, { ReportData } from "@components/ReportCard/ReportCard";
import { Button, Divider, Input, Tooltip } from "@nextui-org/react";
import SwapIcon from "assets/icons/SwapIcon";
import { decodeQueryString } from "utils/functions";

type ReportsToCompare = {
  [key: string]: ReportData;
};

export default function Page() {
  const acceptedHeaders = ["date", "description", "category", "amount"];
  const [file, setFile] = useState<File | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.target.files && setFile(e.target.files[0]);
  };

  const formatValues = (header: string, value: string) => {
    switch (header) {
      case "date":
        return new Date(value);
      case "amount":
        return Number(value);
      default:
        return value;
    }
  };

  const csvFileToArray = (text: string) => {
    setError(false);
    // update csvHeader split, comma is messing it up 
    const csvHeader = text.slice(0, text.indexOf("\n")).split(",");
    const csvRows = text.slice(text.indexOf("\n") + 1).split("\n");
    console.log(csvRows);
    
    const array = csvRows.map((i) => {
      const values = i.split(",");
      const obj = csvHeader.reduce((object, header, index) => {
        const cleanedHeader = header
          .replace(/"/g, "")
          .replace(/\r/g, "")
          .toLowerCase();
        if (acceptedHeaders.indexOf(cleanedHeader.toLowerCase()) === -1) {
          setError(true);
          setErrorMessage(
            `Your CSV contain invalid Headers. Please use the following headers: ${acceptedHeaders.join(
              ", "
            )}`
          );
          return object;
        }
        //@ts-ignore
        object[cleanedHeader] = formatValues(cleanedHeader, values[index]);
        return object;
      }, {});
      return obj;
    });

    setTransactions(array);
  };

  const handleUpload = () => {
    if (!file) {
      return;
    }
    const fileReader = new FileReader();
    fileReader.readAsText(file);
    fileReader.onload = async (e) => {
      const csv = e.target?.result;
      csvFileToArray(csv as string);
    };
  };

  console.log(transactions);
  

  return (
    <div className="flex flex-col">
      <h3 className="text-xl font-semibold mb-4">Upload reports</h3>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col">
          <span>
            Only CSV file are allowed and must contain the following columns:
          </span>
          <div className="flex h-5 items-center space-x-4 text-small mt-4 ml-4">
            <span className="font-bold">Date</span>
            <Divider orientation="vertical" />
            <span className="font-bold">Description</span>
            <Divider orientation="vertical" />
            <span className="font-bold">Category</span>
            <Divider orientation="vertical" />
            <span className="font-bold">Amount</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 mt-8">
          {error && <p className="mb-4 text-danger">{errorMessage}</p>}
          <label htmlFor="File">Upload CSV file</label>
          <input
            name="File"
            type="file"
            accept=".csv"
            onChange={handleOnChange}
          />
          <Button color="primary" className="mt-4 w-fit" onPress={handleUpload}>
            IMPORT CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
