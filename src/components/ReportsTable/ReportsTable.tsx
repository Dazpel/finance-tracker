import React, { Key, useCallback, useEffect, useMemo, useState } from "react";
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
  Pagination,
  Selection,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { ReportDataDTO } from "utils/types";
import { compressToEncodedURIComponent } from "lz-string";
import { VerticalDotsIcon } from "assets/icons/VerticalDotsIcon";
import { formatCreatedDate } from "utils/functions";
import AnnualReportCreationModal from "./AnnualReportCreationModal";

type RowActions = "edit" | "delete" | "view" | "insights";

type TableRow = {
  id: number;
  key: number;
  name: string;
  date: string;
  revenue: number;
  expenses: number;
  total: number;
};

type ReportsTableProps = {
  reportData: ReportDataDTO[];
  reportType?: "monthly" | "annual";
  showFooter?: boolean;
  showReportButton?: boolean;
  handleOnCompare: (encodedURI: string) => void;
  handleOnView?: (encodedURI: string) => void;
  handleOnEdit?: (encodedURI: string) => void;
  handleOnDelete: (index: number) => Promise<void>;
  handleMerge: (reportId_1: number, reportId_2: number) => Promise<void>;
  handleAnnualReport: (reportIds: number[], reportName: string, reports: ReportDataDTO[]) => Promise<void>;
  handleOnInsights?: (reportId: number, reportType: string) => void;
  showCreateAnnualReportHeader?: boolean;
  disableHeader?: boolean;
  isDeletePending?: boolean;
  isMergePending?: boolean;
  isCreateAnnualPending?: boolean;
  selectionResetKey?: number;
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
      id: report.id,
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
  reportType = "monthly",
  handleOnCompare,
  handleOnDelete,
  handleOnEdit,
  handleOnView,
  handleMerge,
  handleAnnualReport,
  handleOnInsights,
  showCreateAnnualReportHeader = false,
  disableHeader = false,
  isDeletePending = false,
  isMergePending = false,
  isCreateAnnualPending = false,
  selectionResetKey = 0,
}: ReportsTableProps) {
  const isAnnual = reportType === "annual";
  const [canCompareReports, setCanCompareReports] = useState(false);
  const [maxRowExceeded, setMaxRowExceeded] = useState(false);
  const [reportsToCompare, setReportsToCompare] = useState<Key[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isAnnualReportModalOpen, setIsAnnualReportModalOpen] = useState(false);
  const [reportIndexToDelete, setReportIndexToDelete] = useState<number | null>(
    null
  );

  useEffect(() => {
    setCanCompareReports(false);
    setReportsToCompare([]);
    setMaxRowExceeded(false);
    setPage(1);
  }, [selectionResetKey]);

  //pagination
  const [page, setPage] = React.useState(1);
  const rowsPerPage = 4;

  const pages = Math.ceil(reportData.length / rowsPerPage);

  const currentPageItems = React.useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    return reportData.slice(start, end);
  }, [page, reportData]);

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

  const handleCompare = useCallback(() => {
    const reports = {
      report1: reportData[reportsToCompare[0] as number],
      report2: reportData[reportsToCompare[1] as number],
    };
    const encodedURI = compressToEncodedURIComponent(JSON.stringify(reports));

    handleOnCompare(encodedURI);
  }, [reportData, reportsToCompare, handleOnCompare]);

  const handleMergeConfirm = async (): Promise<void> => {
    if (reportsToCompare.length === 2) {
      await handleMerge(
        reportData[reportsToCompare[0] as number].id,
        reportData[reportsToCompare[1] as number].id
      );
      setIsMergeModalOpen(false);
    }
  };

  const displayDeleteModal = useCallback((id: number) => {
    setReportIndexToDelete(id);
    setIsDeleteModalOpen(true);
  }, [reportData]);

  const handleActions = useCallback((id: number, action: RowActions) => {
    const report = reportData.find((report) => report.id === id);
    switch (action) {
      case "edit":
        handleOnEdit && handleOnEdit(compressToEncodedURIComponent(JSON.stringify(report)));
        break;
      case "delete":
        displayDeleteModal(id);
        break;
      case "view":
        handleOnView && handleOnView(compressToEncodedURIComponent(JSON.stringify(report)));
        break;
      case "insights":
        if (report && handleOnInsights) {
          handleOnInsights(report.id, report.reportType);
        }
        break;
      default:
        break;
    }
  }, [handleOnEdit, handleOnView, handleOnInsights, reportData, displayDeleteModal]);

  const handleDelete = async () => {
    if (reportIndexToDelete) {
      await handleOnDelete(reportIndexToDelete);
      setIsDeleteModalOpen(false);
    }
  };

  const topContent = useMemo(() => {
    const canCompare = reportsToCompare.length === 2 && canCompareReports;
    return (
      <div className="flex flex-col gap-4 w-full">
        <div className="flex gap-4">
          <Button
            variant="flat"
            className="w-fit"
            onPress={() => setCanCompareReports(!canCompareReports)}
            isDisabled={isDeletePending || isMergePending || isCreateAnnualPending}
          >
            {!canCompareReports ? "Merge or Compare" : "Disable"}
          </Button>
          {canCompare && (
          <div className="flex space-x-2">
            <Button
              color="primary"
              variant="flat"
              className="w-fit"
              onPress={handleCompare}
              isDisabled={isMergePending}
            >
              Compare
            </Button>
            <Button
              color="primary"
              variant="flat"
              className="w-fit"
              onPress={() => setIsMergeModalOpen(true)}
              isLoading={isMergePending}
              isDisabled={isMergePending}
            >
              Merge
            </Button>
          </div>
        )}
          {showCreateAnnualReportHeader && (
            <Button
              color="primary"
              variant="flat"
              className="w-fit"
              onPress={() => setIsAnnualReportModalOpen(true)}
              isLoading={isCreateAnnualPending}
              isDisabled={isCreateAnnualPending}
            >
              Create Annual Report
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
  }, [canCompareReports, maxRowExceeded, reportsToCompare, showCreateAnnualReportHeader, handleCompare, isDeletePending, isMergePending, isCreateAnnualPending]);

  const bottomContent = useMemo(() => {
    return (
      <div className="flex w-full justify-center">
        <Pagination
          isCompact
          showControls
          color="default"
          page={page}
          total={pages}
          onChange={(page) => setPage(page)}
        />
      </div>
    );
  }, [ page, pages ]);

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
                  <DropdownItem key="view button" onPress={() => handleActions(report.id, "view")}>View</DropdownItem>
                  {!isAnnual ? <DropdownItem key="edit button" onPress={() => handleActions(report.id, "edit")}>Edit</DropdownItem> : null}
                  <DropdownItem key="insights button" onPress={() => handleActions(report.id, "insights")}>Insights</DropdownItem>
                  <DropdownItem key="delete button" onPress={() => handleActions(report.id, "delete")}>
                    Delete
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          );
        case "revenue":
          return Math.abs(Number(cellValue)).toFixed(2);
        case "expenses":
        case "total":
          return Number(cellValue).toFixed(2);
        default:
          return cellValue;
      }
    },
    [handleActions]
  );

  return (
    <>
      <Table
        isCompact
        aria-label="Reports table"
        topContent={!disableHeader && topContent}
        bottomContent={reportData.length > rowsPerPage && bottomContent}
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
          items={rows(currentPageItems)}
          emptyContent="No reports found."
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
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
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
                <Button
                  color="danger"
                  variant="light"
                  onPress={handleDelete}
                  isLoading={isDeletePending}
                  isDisabled={isDeletePending}
                >
                  Delete
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
      <Modal
        backdrop="blur"
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        isDismissable={false}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1 text-center">
                Merge Reports
              </ModalHeader>
              <ModalBody>
                <p>
                  Are you sure you want to merge these report? This action
                  cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button color="primary" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  variant="light"
                  onPress={handleMergeConfirm}
                  isLoading={isMergePending}
                  isDisabled={isMergePending}
                >
                  Merge
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
      <AnnualReportCreationModal
        reportData={reportData}
        isOpen={isAnnualReportModalOpen}
        handleAnnualReport={handleAnnualReport}
        setIsOpen={setIsAnnualReportModalOpen}
        isCreateAnnualPending={isCreateAnnualPending}
      />
    </>
  );
}
