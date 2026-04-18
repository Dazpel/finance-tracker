import React, { useMemo } from "react";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { useWindowHeight } from "@components/hooks/useWindowHeight";

type TableRow = {
  key: number;
  category: string;
  amount: number;
};

export type ReportData = {
  [key: string]: number;
};

type ReportCardProps = {
  actionButtonText?: "Create Report" | "Update Report";
  reportData: ReportData;
  showFooter?: boolean;
  showReportButton?: boolean;
  handleSubmitReport?: () => Promise<void>;
  handleOnViewDetails?: () => void;
  fixedPosition?: boolean;
};

const columns = [
  {
    key: "category",
    label: "CATEGORY",
  },
  {
    key: "amount",
    label: "AMOUNT",
    with: "30px",
  },
];

const formatValue = (key: string, value: number) => {
  if (key === "expenses" || key === "total") {
    return value;
  }
  return Number(Math.abs(value).toFixed(2));
};

const rows = (data: ReportData): TableRow[] => {
  return Object.entries(data).map(([key, value], index) => {
    const formattedValue = formatValue(key, value);

    return {
      key: index,
      category: key,
      amount: formattedValue,
    };
  });
};

export default function ReportCard({
  actionButtonText = "Create Report",
  reportData,
  handleSubmitReport,
  handleOnViewDetails,
  showReportButton = false,
  showFooter = false,
  fixedPosition = false,
}: ReportCardProps) {
  const deviceHeight = useWindowHeight();
  const cardPosition = useMemo(() => {
    const position = fixedPosition ? "fixed" : "relative"

    return deviceHeight !== undefined && deviceHeight < 600 ? "relative" : position;
  }, [deviceHeight, fixedPosition]);

  const formatNumber = (value: number) => {
    return value % 1 !== 0 ? value.toFixed(2) : value;
  };
  
  const renderCell = React.useCallback(
    (item: TableRow, columnKey: React.Key) => {
      const boldedArray = ["expenses", "total", "revenue"];
      const cellValue = item[columnKey as keyof TableRow] as string;
      switch (columnKey) {
        case "category":
          const isBolded = boldedArray.includes(cellValue);
          return isBolded ? (
            <span className="font-bold capitalize">{cellValue}</span>
          ) : (
            <span className="capitalize">{cellValue}</span>
          );

        default:
          return formatNumber(cellValue as unknown as number) || cellValue;
      }
    },
    []
  );
  const classNames = useMemo(
    () => ({
      td: [
        "group-data-[last=true]:bg-default-100 group-data-[last=true]:font-bold",
      ],
    }),
    []
  );
  const bottomContent = React.useMemo(() => {
    if (!showFooter) return null;
    return (
      <div className="w-full">
        <Button
          color="primary"
          className="w-full"
          onPress={handleOnViewDetails}
        >
          View Details
        </Button>
      </div>
    );
  }, [showFooter, handleOnViewDetails]);
  return (
    <div className="flex flex-col w-80 relative">
      <div className={`flex flex-col gap-4 ${cardPosition} bottom-[10px]`}>
        <Table
          isCompact
          aria-label="Report card table"
          classNames={classNames}
          bottomContent={bottomContent}
          bottomContentPlacement="inside"
        >
          <TableHeader columns={columns}>
            {(column) => (
              <TableColumn key={column.key}>{column.label}</TableColumn>
            )}
          </TableHeader>
          <TableBody
            items={rows(reportData)}
            emptyContent="No transactions found yet."
          >
            {(item) => (
              <TableRow key={item.key}>
                {(columnKey) => (
                  <TableCell>{renderCell(item, columnKey)}</TableCell>
                )}
              </TableRow>
            )}
          </TableBody>
        </Table>
        {showReportButton && (
          <Button color="primary" onPress={handleSubmitReport}>
            {actionButtonText}
          </Button>
        )}
      </div>
    </div>
  );
}
