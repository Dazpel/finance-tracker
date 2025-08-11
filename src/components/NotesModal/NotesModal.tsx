"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
} from "@heroui/react";

interface Note {
  id?: number;
  title: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

interface NotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: { title: string; content: string }) => Promise<void>;
  note?: Note | null;
  isEditing?: boolean;
}

export const NotesModal = ({
  isOpen,
  onClose,
  onSave,
  note,
  isEditing = false,
}: NotesModalProps): React.ReactElement => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (note && isEditing) {
      setTitle(note.title);
      setContent(note.content);
    } else {
      setTitle("");
      setContent("");
    }
  }, [note, isEditing, isOpen]);

  const handleSave = useCallback(async () => {
    if (!title.trim() || !content.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      await onSave({ title: title.trim(), content: content.trim() });
      setTitle("");
      setContent("");
      onClose();
    } catch (error) {
      console.error("Error saving note:", error);
    } finally {
      setIsLoading(false);
    }
  }, [title, content, onSave, onClose]);

  const handleClose = useCallback(() => {
    setTitle("");
    setContent("");
    onClose();
  }, [onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      classNames={{
        base: "max-w-md",
        backdrop: "backdrop-opacity-20",
      }}
    >
      <ModalContent>
        {(onClose) => (
          <div className="shadow-lg">
            <div className="p-4">
              <ModalHeader className="flex flex-col gap-1 font-handwriting text-xl border-b pb-2">
                {isEditing ? "Edit Note" : "New Note"}
              </ModalHeader>
              <ModalBody className="gap-4 py-4">
                <Input
                  autoFocus
                  label="Title"
                  placeholder="Enter note title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  classNames={{
                    inputWrapper: "border shadow-sm",
                  }}
                />
                <Textarea
                  label="Content"
                  placeholder="Write your note here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  minRows={6}
                  maxRows={12}
                  classNames={{
                    inputWrapper: "border shadow-sm",
                  }}
                />
              </ModalBody>
              <ModalFooter className="border-t pt-2">
                <Button color="danger" variant="light" onPress={handleClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleSave}
                  isLoading={isLoading}
                  isDisabled={!title.trim() || !content.trim()}
                >
                  {isEditing ? "Update" : "Save"}
                </Button>
              </ModalFooter>
            </div>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
