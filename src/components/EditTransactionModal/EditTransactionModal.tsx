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
  Textarea,
} from "@heroui/react";
import { ChevronDownIcon } from "assets/icons/ChevronDownIcon";
import React from "react";
import { defaultCategories } from "utils/constants";

type EditTransactionModalProps = {
  isModalOpen: boolean;
  setIsModalOpen: (isOpen: boolean) => void;
  editableTransaction: any;
  getCategorySelected: string;
  selectedCategory: Set<string>;
  handleEditSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  setSelectedCategory: (keys: Set<string>) => void;
  descriptionToUse?: "original_description" | "name";
  isPendingReport?: boolean;
};

function EditTransactionModal({
  isModalOpen,
  setIsModalOpen,
  editableTransaction,
  getCategorySelected,
  selectedCategory,
  handleEditSubmit,
  setSelectedCategory,
  descriptionToUse = "original_description",
  isPendingReport = false,
}: EditTransactionModalProps) {
  return (
    <Modal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      placement="top-center"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              Edit Transaction
            </ModalHeader>
            <form onSubmit={handleEditSubmit}>
              <ModalBody>
                <Input
                  autoFocus
                  label="Description"
                  placeholder="Enter a description"
                  variant="bordered"
                  defaultValue={
                    editableTransaction[descriptionToUse] || ""
                  }
                  isReadOnly={isPendingReport}
                  description={
                    isPendingReport
                      ? "Description cannot be edited on a pending report"
                      : undefined
                  }
                />
                <Input
                  label="Amount"
                  placeholder="Enter an amount"
                  type="number"
                  variant="bordered"
                  defaultValue={`${-editableTransaction.amount}`}
                  isReadOnly={isPendingReport}
                  description={
                    isPendingReport
                      ? "Amount cannot be edited on a pending report"
                      : undefined
                  }
                />
                <Textarea
                  label="Notes"
                  placeholder="Enter notes for this transaction (optional)"
                  variant="bordered"
                  defaultValue={editableTransaction.notes || ""}
                  description="Add any additional notes or comments about this transaction"
                />
                <div className="flex gap-2 items-center">
                  <span>Category:</span>
                  <Dropdown>
                    <DropdownTrigger>
                      <Button
                        color="primary"
                        variant="bordered"
                        className="capitalize"
                        aria-label={getCategorySelected}
                        endContent={<ChevronDownIcon className="text-small" />}
                      >
                        {getCategorySelected}
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Single selection example"
                      variant="flat"
                      color="primary"
                      disallowEmptySelection
                      selectionMode="single"
                      selectedKeys={Array.from(selectedCategory)}
                      onSelectionChange={(keys) =>
                        setSelectedCategory(keys as Set<string>)
                      }
                    >
                      {defaultCategories.map((category) => (
                        <DropdownItem key={category} className="capitalize">
                          {category}
                        </DropdownItem>
                      ))}
                    </DropdownMenu>
                  </Dropdown>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="flat" onPress={onClose}>
                  Close
                </Button>
                <button>Save</button>
              </ModalFooter>
            </form>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

export default EditTransactionModal;
