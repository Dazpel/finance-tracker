"use client";

import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";

type ApproveReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  monthLabel: string;
  isSubmitting: boolean;
};

export default function ApproveReportModal({
  isOpen,
  onClose,
  onConfirm,
  monthLabel,
  isSubmitting,
}: ApproveReportModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} placement="top-center">
      <ModalContent>
        <ModalHeader>Approve & Lock {monthLabel}?</ModalHeader>
        <ModalBody>
          <p>
            Once approved, this report becomes read-only. Late Plaid revisions
            to this month will not be reflected in the locked snapshot.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button
            color="default"
            variant="flat"
            onPress={onClose}
            isDisabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            color="success"
            onPress={onConfirm}
            isLoading={isSubmitting}
            isDisabled={isSubmitting}
          >
            Approve
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
