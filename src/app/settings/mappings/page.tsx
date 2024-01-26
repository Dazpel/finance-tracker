"use client";

import { plaidClient } from "@lib/plaid";
import { Button, Select, SelectItem } from "@nextui-org/react";
import React from "react";
import { defaultCategories, plaidCategories } from "utils/constants";

export default function Page() {
  return (
    <div className="flex flex-col">
      <h3 className="text-xl font-semibold mb-4">Mappings</h3>
      <div className="flex flex-col">
        <div className="flex gap-6 max-w-lg">
          <div className="flex flex-col gap-2 flex-1">
            <label htmlFor="plaidCategory">
              Link transactions with category:
            </label>
            <Select
              id="plaidCategory"
              label="Select a category"
            >
              {plaidCategories.map((category, index) => (
                <SelectItem key={index} value={category}>
                  {category}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <label htmlFor="customCategory">To:</label>
            <Select
              id="customCategory"
              label="Select a category"
            >
              {defaultCategories.map((category, index) => (
                <SelectItem key={index} value={category}>
                  {category}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>
        <Button color="primary" className="mt-4 w-fit">
          Save
        </Button>
      </div>
    </div>
  );
}
