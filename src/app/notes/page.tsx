"use client";

import React, { useState, useCallback } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
} from "@heroui/react";
import { NotesModal } from "@components/NotesModal/NotesModal";
import { NotesTable } from "@components/NotesTable/NotesTable";
import {
  useNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
} from "@hooks/useNotes";

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export default function NotesPage(): React.ReactElement {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Tanstack Query hooks
  const { data: notes = [], isLoading, error } = useNotes();
  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();

  // Handle opening modal for adding new note
  const handleAddNote = useCallback(() => {
    setSelectedNote(null);
    setIsEditing(false);
    setIsModalOpen(true);
  }, []);

  // Handle opening modal for editing note
  const handleEditNote = useCallback((note: Note) => {
    setSelectedNote(note);
    setIsEditing(true);
    setIsModalOpen(true);
  }, []);

  // Handle opening delete confirmation modal
  const handleDeleteNote = useCallback(
    (noteId: string) => {
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        setNoteToDelete(note);
        setIsDeleteModalOpen(true);
      }
    },
    [notes]
  );

  // Handle confirming note deletion
  const handleConfirmDelete = useCallback(async () => {
    if (noteToDelete) {
      setIsDeleting(true);
      try {
        await deleteNoteMutation.mutateAsync(noteToDelete.id);
        setIsDeleteModalOpen(false);
        setNoteToDelete(null);
      } catch (error) {
        console.error("Error deleting note:", error);
      } finally {
        setIsDeleting(false);
      }
    }
  }, [noteToDelete, deleteNoteMutation]);

  // Handle closing modal
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedNote(null);
    setIsEditing(false);
  }, []);

  // Handle saving note (create or update)
  const handleSaveNote = useCallback(
    async (noteData: { title: string; content: string }) => {
      if (isEditing && selectedNote) {
        await updateNoteMutation.mutateAsync({ id: selectedNote.id, noteData });
      } else {
        await createNoteMutation.mutateAsync(noteData);
      }
    },
    [isEditing, selectedNote, updateNoteMutation, createNoteMutation]
  );

  return (
    <div className="h-full flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-default-700">Notes</h1>
          <p className="text-default-500">
            Create and manage your personal notes
          </p>
        </div>
        <Button
          color="primary"
          onPress={handleAddNote}
          startContent={<span className="text-lg">+</span>}
        >
          Add Note
        </Button>
      </div>

      {/* Notes Table */}
      <Card className="w-full">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-center w-full">
            <h2 className="text-lg font-semibold text-default-700">
              Your Notes
            </h2>
            <div className="text-sm text-default-500">
              {notes.length} {notes.length === 1 ? "note" : "notes"}
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <NotesTable
            notes={notes}
            onEditNote={handleEditNote}
            onDeleteNote={handleDeleteNote}
            isLoading={isLoading}
          />
        </CardBody>
      </Card>

      {/* Notes Modal */}
      <NotesModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveNote}
        note={selectedNote}
        isEditing={isEditing}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        backdrop="blur"
        isOpen={isDeleteModalOpen}
        onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
        isDismissable={!isDeleting}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1 text-center">
                Delete Note
              </ModalHeader>
              <ModalBody>
                <p>
                  Are you sure you want to delete &quot;{noteToDelete?.title}
                  &quot;? This action cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button
                  color="primary"
                  onPress={onClose}
                  isDisabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  color="danger"
                  variant="light"
                  onPress={handleConfirmDelete}
                  isDisabled={isDeleting}
                  startContent={isDeleting ? <Spinner size="sm" color="danger" /> : null}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
