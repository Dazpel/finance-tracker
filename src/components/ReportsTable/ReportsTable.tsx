import React, { Key, useCallback, useMemo, useState } from "react";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Selection,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@nextui-org/react";
import { ReportDataDTO } from "utils/types";
import { compressToEncodedURIComponent } from "lz-string";
import { VerticalDotsIcon } from "assets/icons/VerticalDotsIcon";
import { formatCreatedDate } from "utils/functions";

type RowActions = "edit" | "delete" | "view";

type TableRow = {
  key: number;
  name: string;
  date: string;
  revenue: number;
  expenses: number;
  total: number;
};

type ReportsTableProps = {
  reportData: ReportDataDTO[];
  showFooter?: boolean;
  showReportButton?: boolean;
  handleOnCompare: (encodedURI: string) => void;
  handleOnView?: (encodedURI: string) => void;
  handleOnEdit?: (encodedURI: string) => void;
  handleOnDelete: (index: number) => Promise<void>;
};

const columns = [
  {
    key: "name",
    label: "NAME",
  },
  {
    key: "date",
    label: "DATE",
  },
  {
    key: "revenue",
    label: "REVENUE",
  },
  {
    key: "expenses",
    label: "EXPENSES",
  },
  {
    key: "total",
    label: "TOTAL",
  },
  {
    key: "actions",
    label: "ACTIONS",
  },
];

const rows = (data: ReportDataDTO[]): TableRow[] => {
  return data.map((report, index) => {
    return {
      key: index,
      name: report.reportName,
      date: formatCreatedDate(report.createdAt),
      revenue: report.revenue,
      expenses: report.expenses,
      total: report.total,
    };
  });
};

export default function ReportsTable({
  reportData,
  handleOnCompare,
  handleOnDelete,
  handleOnEdit,
  handleOnView,
}: ReportsTableProps) {
  const [canCompareReports, setCanCompareReports] = useState(false);
  const [maxRowExceeded, setMaxRowExceeded] = useState(false);
  const [reportsToCompare, setReportsToCompare] = useState<Key[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [reportIndexToDelete, setReportIndexToDelete] = useState<string | null>(
    null
  );

  const handleRowSelection = (key: Selection | string) => {
    setMaxRowExceeded(false);

    if (key === "all") {
      const selectedKeys = rows(reportData).map((row) => row.key);
      setMaxRowExceeded(selectedKeys.length > 2);
      setReportsToCompare(selectedKeys);
    } else if (key instanceof Set) {
      const keysArray = Array.from(key);
      setMaxRowExceeded(key.size > 2);
      if (key.size > 0) {
        setReportsToCompare(keysArray);
      }
    }
  };

  const handleCompare = () => {
    const reports = {
      report1: reportData[reportsToCompare[0] as number],
      report2: reportData[reportsToCompare[1] as number],
    };
    const encodedURI = compressToEncodedURIComponent(JSON.stringify(reports));

    handleOnCompare(encodedURI);
  };

  const displayDeleteModal = (index: number) => {
    setReportIndexToDelete(reportData[index].id);
    setIsOpen(true);
  };

  const handleActions = (index: number, action: RowActions) => {
    switch (action) {
      case "edit":
        handleOnEdit && handleOnEdit(compressToEncodedURIComponent(JSON.stringify(reportData[index])));
        break;
      case "delete":
        displayDeleteModal(index);
        break;
      case "view":
        handleOnView && handleOnView(compressToEncodedURIComponent(JSON.stringify(reportData[index])));
        break;
      default:
        break;
    }
  }

  const handleDelete = async () => {
    if (reportIndexToDelete) {
      await handleOnDelete(parseInt(reportIndexToDelete));
      setIsOpen(false);
    }
  };

  const topContent = useMemo(() => {
    return (
      <div className="flex flex-col gap-4 w-full">
        <div className="flex gap-4">
          <Button
            variant="flat"
            className="w-fit"
            onClick={() => setCanCompareReports(!canCompareReports)}
          >
            {!canCompareReports ? "Compare reports" : "Disable compare"}
          </Button>
          {reportsToCompare.length === 2 && canCompareReports && (
            <Button
              color="primary"
              variant="flat"
              className="w-fit"
              onClick={handleCompare}
            >
              Compare
            </Button>
          )}
        </div>
        {maxRowExceeded && canCompareReports && (
          <p className="pl-4 text-danger">
            You can only compare up to 2 reports at a time.
          </p>
        )}
      </div>
    );
  }, [canCompareReports, maxRowExceeded, reportsToCompare]);

  const renderCell = useCallback(
    (report: TableRow, columnKey: React.Key) => {
      const cellValue = report[columnKey as keyof TableRow] as string;

      switch (columnKey) {
        case "actions":
          return (
            <div className="text-center">
              <Dropdown aria-label="actions dropdown">
                <DropdownTrigger>
                  <Button isIconOnly size="sm" variant="light">
                    <VerticalDotsIcon className="text-default-300" />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu aria-label="dropdown options">
                  <DropdownItem onClick={() => handleActions(report.key, "view")}>View</DropdownItem>
                  <DropdownItem onClick={() => handleActions(report.key, "edit")}>Edit</DropdownItem>
                  <DropdownItem onClick={() => handleActions(report.key, "delete")}>
                    Delete
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          );
        default:
          return cellValue;
      }
    },
    [reportData]
  );

  return (
    <>
      <Table
        isCompact
        aria-label="Reports table"
        topContent={topContent}
        topContentPlacement="inside"
        onSelectionChange={handleRowSelection}
        selectionMode={canCompareReports ? "multiple" : "none"}
        classNames={{
          th: "last:text-center",
        }}
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
      <Modal
        backdrop="blur"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        isDismissable={false}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1 text-center">
                Delete Report
              </ModalHeader>
              <ModalBody>
                <p>
                  Are you sure you want to delete this report? This action
                  cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button color="primary" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="danger" variant="light" onPress={handleDelete}>
                  Delete
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
