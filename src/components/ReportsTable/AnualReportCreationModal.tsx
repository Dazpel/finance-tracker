import React, { useState } from "react";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  Selection,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@nextui-org/react";
import { ReportDataDTO } from "utils/types";

type AnualReportCreationModalProps = {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  reportData: ReportDataDTO[];
  handleAnualReport: (reportIds: number[], reportName: string, reports: ReportDataDTO[]) => Promise<void>;
};

export default function AnualReportCreationModal({
  isOpen,
  setIsOpen,
  reportData,
  handleAnualReport,
}: AnualReportCreationModalProps) {
  const [reportsSelected, setReportsSelected] = useState("");
  const [reportName, setReportName] = useState("");
  const [isReportNameValid, setIsReportNameValid] = useState(true);

  const handleReportNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsReportNameValid(true);
    const reportNameRegex = /^[a-zA-Z0-9\s-]+$/;
    const reportName = e.target.value;
    if (reportName.length > 0 && reportNameRegex.test(reportName)) {
      setIsReportNameValid(true);
    } else {
      setIsReportNameValid(false);
    }
    setReportName(reportName);
  };

  const createAnualReport = async () => {
    const reportIds = reportsSelected.split(",").map((id) => parseInt(id));
    const filteredReports = reportIds.map((id) => reportData.find((r) => r.id === id));

    if (filteredReports === undefined)  {
      return;
    }

    await handleAnualReport(reportIds, reportName, filteredReports as ReportDataDTO[]);
  };

  return (
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
              Create Anual Report
            </ModalHeader>
            <ModalBody>
              <Input
                type="text"
                label="Report name"
                placeholder="Enter a report name"
                className="w-fit"
                variant="faded"
                value={reportName}
                isInvalid={!isReportNameValid}
                errorMessage={
                  !isReportNameValid && "Please enter a report name"
                }
                onChange={handleReportNameChange}
              />
              <Select
                className="max-w-xs"
                label="Select reports"
                placeholder="Select a report"
                selectionMode="multiple"
                onChange={(e) => setReportsSelected(e.target.value)}
              >
                {reportData.map((report) => (
                  <SelectItem key={report.id}>{report.reportName}</SelectItem>
                ))}
              </Select>
            </ModalBody>
            <ModalFooter>
              <Button color="primary" onPress={onClose}>
                Cancel
              </Button>
              <Button
                color="primary"
                variant="light"
                isDisabled={!reportsSelected || !isReportNameValid}
                onPress={createAnualReport}
              >
                Create
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
