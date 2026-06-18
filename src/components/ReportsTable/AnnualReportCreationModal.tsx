import React, { useEffect, useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
} from "@heroui/react";
import { ReportDataDTO } from "utils/types";

type AnnualReportCreationModalProps = {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  reportData: ReportDataDTO[];
  handleAnnualReport: (reportIds: string[], reportName: string, reports: ReportDataDTO[]) => Promise<void>;
  isCreateAnnualPending?: boolean;
};

export default function AnnualReportCreationModal({
  isOpen,
  setIsOpen,
  reportData,
  handleAnnualReport,
  isCreateAnnualPending = false,
}: AnnualReportCreationModalProps) {
  const [reportsSelected, setReportsSelected] = useState("");
  const [reportName, setReportName] = useState("");
  const [isReportNameValid, setIsReportNameValid] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      setReportName("");
      setReportsSelected("");
      setIsReportNameValid(true);
    }
  }, [isOpen]);

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

  const createAnnualReport = async () => {
    const reportIds = reportsSelected
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const filteredReports = reportIds
      .map((id) => reportData.find((r) => r.id === id))
      .filter((report): report is ReportDataDTO => report !== undefined);

    // Bail out if any selected id didn't resolve to a known report, so we never
    // pass undefined entries into annual aggregation downstream.
    if (filteredReports.length !== reportIds.length) {
      return;
    }

    await handleAnnualReport(reportIds, reportName, filteredReports);
    setIsOpen(false);
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
              Create Annual Report
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
                isDisabled={!reportsSelected || !isReportNameValid || isCreateAnnualPending}
                isLoading={isCreateAnnualPending}
                onPress={createAnnualReport}
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
