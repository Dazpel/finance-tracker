import { useState } from "react";
import { DateRangePicker as HeroUIDateRangePicker, Button, CalendarDate } from "@heroui/react";
import { getLocalTimeZone, today, DateValue } from "@internationalized/date";
import { formatDate } from "../../app/insights/utils";

export type DateRange = {
  startDate: string;
  endDate: string;
};

type DateRangePickerProps = {
  onSubmit: (dates: DateRange) => void;
  maxValue?: DateValue;
  minValue?: DateValue;
  label?: string;
  labelPlacement?: "inside" | "outside";
  showMonthAndYearPickers?: boolean;
  className?: string;
  buttonText?: string;
  isLoading?: boolean;
};

export default function DateRangePicker({
  onSubmit,
  maxValue = today(getLocalTimeZone()),
  minValue,
  label = "Select dates",
  labelPlacement = "outside",
  showMonthAndYearPickers = false,
  className = "",
  buttonText = "Submit",
  isLoading = false
}: DateRangePickerProps) {
  const [selectedDates, setSelectedDates] = useState<any>();

  const handleSubmit = () => {
    if (selectedDates?.start && selectedDates?.end) {
      const formattedDates: DateRange = {
        startDate: formatDate(selectedDates.start),
        endDate: formatDate(selectedDates.end),
      };
      onSubmit(formattedDates);
    }
  };

  const isSubmitDisabled = !selectedDates?.start || !selectedDates?.end;

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <HeroUIDateRangePicker
        label={label}
        labelPlacement={labelPlacement}
        showMonthAndYearPickers={showMonthAndYearPickers}
        maxValue={maxValue as unknown as CalendarDate}
        minValue={minValue as unknown as CalendarDate}
        onChange={(value) => value && setSelectedDates(value)}
      />
      
      <Button
        onPress={handleSubmit}
        isDisabled={isSubmitDisabled}
        color="primary"
        className="w-fit"
        isLoading={isLoading}
      >
        {buttonText}
      </Button>
    </div>
  );
}
