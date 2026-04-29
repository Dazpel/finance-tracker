import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  count: number;
}

export const BulkDeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  count,
}: Props) => {
  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onClose={onClose}
      isDismissable={false}
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader className="flex flex-col gap-1 text-center">
              Delete Transactions
            </ModalHeader>
            <ModalBody>
              <p>
                Are you sure you want to delete {count}{" "}
                {count === 1 ? "transaction" : "transactions"}? This action can
                be undone with the Undo button.
              </p>
            </ModalBody>
            <ModalFooter>
              <Button color="primary" onPress={close}>
                Cancel
              </Button>
              <Button
                color="danger"
                variant="light"
                onPress={() => {
                  onConfirm();
                  close();
                }}
              >
                Delete
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
