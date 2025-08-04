"use client";

import React, { useState, useCallback } from "react";
import { Button, Card, CardBody, CardHeader } from "@heroui/react";
import { NotesModal } from "@components/NotesModal/NotesModal";
import { NotesTable } from "@components/NotesTable/NotesTable";
import { useNotes, useCreateNote, useUpdateNote } from "@hooks/useNotes";

interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export default function NotesPage(): React.ReactElement {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Tanstack Query hooks
  const { data: notes = [], isLoading, error } = useNotes();
  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();

  // Handle opening modal for adding new note
  const handleAddNote = useCallback(() => {
    setSelectedNote(null);
    setIsEditing(false);
    setIsModalOpen(true);
  }, []);

  // Handle opening modal for editing note
  const handleOpenNote = useCallback((note: Note) => {
    setSelectedNote(note);
    setIsEditing(true);
    setIsModalOpen(true);
  }, []);

  // Handle closing modal
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedNote(null);
    setIsEditing(false);
  }, []);

  // Handle saving note (create or update)
  const handleSaveNote = useCallback(async (noteData: { title: string; content: string }) => {
    if (isEditing && selectedNote) {
      await updateNoteMutation.mutateAsync({ id: selectedNote.id, noteData });
    } else {
      await createNoteMutation.mutateAsync(noteData);
    }
  }, [isEditing, selectedNote, updateNoteMutation, createNoteMutation]);

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
          className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg"
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
            onOpenNote={handleOpenNote}
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
    </div>
  );
}