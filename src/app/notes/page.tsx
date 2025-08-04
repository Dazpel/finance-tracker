"use client";

import React, { useState, useEffect } from "react";
import { Button, Card, CardBody, CardHeader } from "@heroui/react";
import { NotesModal } from "@components/NotesModal/NotesModal";
import { NotesTable } from "@components/NotesTable/NotesTable";

interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch notes from API
  const fetchNotes = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/notes");
      if (response.ok) {
        const data = await response.json();
        setNotes(data.notes || []);
      } else {
        console.error("Failed to fetch notes");
      }
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  // Handle creating a new note
  const handleCreateNote = async (noteData: { title: string; content: string }) => {
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(noteData),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes(prev => [data.note, ...prev]);
      } else {
        console.error("Failed to create note");
      }
    } catch (error) {
      console.error("Error creating note:", error);
    }
  };

  // Handle updating an existing note
  const handleUpdateNote = async (noteData: { title: string; content: string }) => {
    if (!selectedNote) return;

    try {
      const response = await fetch(`/api/notes/${selectedNote.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(noteData),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes(prev => 
          prev.map(note => 
            note.id === selectedNote.id ? data.note : note
          )
        );
      } else {
        console.error("Failed to update note");
      }
    } catch (error) {
      console.error("Error updating note:", error);
    }
  };

  // Handle opening modal for adding new note
  const handleAddNote = () => {
    setSelectedNote(null);
    setIsEditing(false);
    setIsModalOpen(true);
  };

  // Handle opening modal for editing note
  const handleOpenNote = (note: Note) => {
    setSelectedNote(note);
    setIsEditing(true);
    setIsModalOpen(true);
  };

  // Handle closing modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedNote(null);
    setIsEditing(false);
  };

  // Handle saving note (create or update)
  const handleSaveNote = async (noteData: { title: string; content: string }) => {
    if (isEditing) {
      await handleUpdateNote(noteData);
    } else {
      await handleCreateNote(noteData);
    }
  };

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