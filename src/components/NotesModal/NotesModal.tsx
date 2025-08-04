"use client";

import React, { useState, useEffect } from "react";
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

export const NotesModal: React.FC<NotesModalProps> = ({
  isOpen,
  onClose,
  onSave,
  note,
  isEditing = false,
}) => {
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

  const handleSave = async () => {
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
  };

  const handleClose = () => {
    setTitle("");
    setContent("");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      classNames={{
        base: "max-w-md",
        backdrop: "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20",
      }}
    >
      <ModalContent>
        {(onClose) => (
          <div className="bg-gradient-to-br from-yellow-200 via-yellow-100 to-yellow-200 border-2 border-yellow-300 shadow-lg transform rotate-1">
            <div className="p-4 -rotate-1">
              <ModalHeader className="flex flex-col gap-1 text-gray-800 font-handwriting text-xl border-b border-yellow-300 pb-2">
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
                    base: "max-w-full",
                    mainWrapper: "h-full",
                    input: "text-small bg-transparent text-gray-800 placeholder:text-gray-600",
                    inputWrapper: "h-full font-normal text-default-500 bg-yellow-50 border border-yellow-300 shadow-sm",
                  }}
                  size="sm"
                />
                <Textarea
                  label="Content"
                  placeholder="Write your note here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  minRows={6}
                  maxRows={12}
                  classNames={{
                    base: "max-w-full",
                    input: "resize-none bg-transparent text-gray-800 placeholder:text-gray-600",
                    inputWrapper: "bg-yellow-50 border border-yellow-300 shadow-sm",
                  }}
                />
              </ModalBody>
              <ModalFooter className="border-t border-yellow-300 pt-2">
                <Button
                  color="danger"
                  variant="light"
                  onPress={handleClose}
                  className="text-gray-700 hover:bg-yellow-300"
                >
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleSave}
                  isLoading={isLoading}
                  isDisabled={!title.trim() || !content.trim()}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white shadow-md"
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