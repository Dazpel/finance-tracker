import React, { useCallback,  useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@nextui-org/react";
import { RecurringReportDataDTO, ReportDataDTO } from "utils/types";
import { compressToEncodedURIComponent } from "lz-string";
import { VerticalDotsIcon } from "assets/icons/VerticalDotsIcon";

type RowActions = "edit" | "delete" | "view";

type TableRow = {
  key: number;
  name: string;
  inflow: number;
  outflow: number;
  total: number;
};

type RecurringReportsTableProps = {
  reportData: RecurringReportDataDTO[];
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
    key: "inflow",
    label: "INFLOW",
  },
  {
    key: "outflow",
    label: "OUTFLOW",
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

const rows = (data: RecurringReportDataDTO[]): TableRow[] => {
  return data.map((report, index) => {
    return {
      key: index,
      name: report.reportName,
      inflow: report.inflow,
      outflow: report.outflow,
      total: report.total,
    };
  });
};

export default function RecurringReportsTable({
  reportData,
  handleOnDelete,
  handleOnEdit,
  handleOnView,
}: RecurringReportsTableProps) {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [reportIndexToDelete, setReportIndexToDelete] = useState<number | null>(
    null
  );
    
  const displayDeleteModal = useCallback(
    (index: number) => {
      setReportIndexToDelete(reportData[index].id);
      setIsDeleteModalOpen(true);
    },
    [reportData]
  );

  const handleActions = useCallback(
    (index: number, action: RowActions) => {
      switch (action) {
        case "edit":
          handleOnEdit &&
            handleOnEdit(
              compressToEncodedURIComponent(JSON.stringify(reportData[index]))
            );
          break;
        case "delete":
          displayDeleteModal(index);
          break;
        case "view":
          handleOnView &&
            handleOnView(
              compressToEncodedURIComponent(JSON.stringify(reportData[index]))
            );
          break;
        default:
          break;
      }
    },
    [handleOnEdit, handleOnView, reportData, displayDeleteModal]
  );

  const handleDelete = async () => {
    if (reportIndexToDelete) {
      await handleOnDelete(reportIndexToDelete);
      setIsDeleteModalOpen(false);
    }
  };

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
                  <DropdownItem
                    key="view button"
                    onPress={() => handleActions(report.key, "view")}
                  >
                    View
                  </DropdownItem>
                  <DropdownItem
                    key="edit button"
                    onPress={() => handleActions(report.key, "edit")}
                  >
                    Edit
                  </DropdownItem>
                  <DropdownItem
                    key="delete button"
                    onPress={() => handleActions(report.key, "delete")}
                  >
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
    [handleActions]
  );

  return (
    <>
      <Table
        isCompact
        aria-label="Reports table"
        topContentPlacement="inside"
        classNames={{
          th: "last:text-center",
        }}
      >
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn key={column.key}>{column.label}</TableColumn>
          )}
        </TableHeader>
        <TableBody items={rows(reportData)} emptyContent="No reports found.">
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
