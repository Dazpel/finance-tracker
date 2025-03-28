import { Button } from "@nextui-org/react";
import React, { useState } from "react";
import ReactDatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { formatDate } from "utils/functions";

export type DateRange = {
  startDate: String;
  endDate: String;
};

type DateRangePickerProps = {
  onFetch: (dates: DateRange) => void;
  isLoading?: boolean;
  title: string;
};

export default function DateRangePicker({
  onFetch,
  isLoading,
  title
}: DateRangePickerProps) {
  const [startDateRaw, setStartDateRaw] = useState<Date | undefined>(undefined);
  const [endDateRaw, setEndDateRaw] = useState<Date | undefined>(undefined);
  const [error, setError] = useState(false);
  const maxDate = new Date();

  const handleSearch = () => {
    setError(false);
    if (startDateRaw && endDateRaw) {
      const startDate = formatDate(startDateRaw);
      const endDate = formatDate(endDateRaw);
      onFetch({ startDate, endDate });
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p>{title}</p>
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex gap-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="startDate">From:</label>
            <ReactDatePicker
              showIcon
              closeOnScroll
              className="date-picker"
              autoComplete="off"
              icon="fa fa-calendar"
              name="startDate"
              placeholderText="Start Date"
              selectsStart
              selected={startDateRaw}
              onChange={(date) => date && setStartDateRaw(date)}
              startDate={startDateRaw}
              maxDate={maxDate}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="endDate">To:</label>
            <ReactDatePicker
              showIcon
              className="date-picker"
              autoComplete="off"
              icon="fa fa-calendar"
              closeOnScroll
              name="endDate"
              placeholderText="End Date"
              selectsEnd
              selected={endDateRaw}
              onChange={(date) => date && setEndDateRaw(date)}
              startDate={startDateRaw}
              endDate={endDateRaw}
              minDate={startDateRaw}
              maxDate={maxDate}
            />
          </div>
        </div>
        <Button
          isLoading={isLoading}
          className="w-fit"
          radius="full"
          size="md"
          color="primary"
          onPress={handleSearch}
        >
          Search
        </Button>
        {error && (
          <p className="text-danger">
            Please ensure both Start and End dates are selected.
          </p>
        )}
      </div>
    </div>
  );
}
