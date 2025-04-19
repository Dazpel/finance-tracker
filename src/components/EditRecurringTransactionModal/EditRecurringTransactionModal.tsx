import React, { useState } from "react";
import {
    Button,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
  } from "@heroui/react";
  
  type EditRecurringTransactionProps = {
    isModalOpen: boolean;
    setIsModalOpen: (isOpen: boolean) => void;
    editableTransaction: any;
    handleEditSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  };
  
  function EditRecurringTransactionModal({
    isModalOpen,
    setIsModalOpen,
    editableTransaction,
    handleEditSubmit
  }: EditRecurringTransactionProps) {
    const [chargeDay, setChargeDay] = useState(editableTransaction.last_date);
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
                    defaultValue={editableTransaction.description}
                  />
                  <Input
                    label="Charge Day"
                    placeholder="Enter a date"
                    variant="bordered"
                    type="number"
                    min={0}
                    max={31}
                    isInvalid={chargeDay > 31}
                    onChange={(e) => setChargeDay(e.target.value)}
                    errorMessage="Please enter a valid day"
                  />
                  <Input
                    label="Amount"
                    placeholder="Enter an amount"
                    type="number"
                    variant="bordered"
                    defaultValue={editableTransaction.last_amount?.amount}
                  />
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
  
  export default EditRecurringTransactionModal;
  