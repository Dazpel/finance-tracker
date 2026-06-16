import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateNoteData {
  title: string;
  content: string;
}

interface UpdateNoteData {
  title: string;
  content: string;
}

// Fetch all notes
export const useNotes = () => {
  return useQuery({
    queryKey: ["notes"],
    queryFn: async (): Promise<Note[]> => {
      const response = await fetch("/api/notes");
      if (!response.ok) {
        throw new Error("Failed to fetch notes");
      }
      const data = await response.json();
      return data.notes || [];
    },
  });
};

// Create a new note
export const useCreateNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteData: CreateNoteData): Promise<Note> => {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(noteData),
      });

      if (!response.ok) {
        throw new Error("Failed to create note");
      }

      const data = await response.json();
      return data.note;
    },
    onSuccess: (newNote) => {
      // Optimistically update the cache
      queryClient.setQueryData(["notes"], (oldNotes: Note[] = []) => [
        newNote,
        ...oldNotes,
      ]);
    },
  });
};

// Update an existing note
export const useUpdateNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      noteData,
    }: {
      id: string;
      noteData: UpdateNoteData;
    }): Promise<Note> => {
      const response = await fetch(`/api/notes/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(noteData),
      });

      if (!response.ok) {
        throw new Error("Failed to update note");
      }

      const data = await response.json();
      return data.note;
    },
    onSuccess: (updatedNote) => {
      // Optimistically update the cache
      queryClient.setQueryData(["notes"], (oldNotes: Note[] = []) =>
        oldNotes.map((note) =>
          note.id === updatedNote.id ? updatedNote : note
        )
      );
    },
  });
};

// Delete a note
export const useDeleteNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await fetch(`/api/notes/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete note");
      }
    },
    onSuccess: (_, deletedId) => {
      // Optimistically update the cache
      queryClient.setQueryData(["notes"], (oldNotes: Note[] = []) =>
        oldNotes.filter((note) => note.id !== deletedId)
      );
    },
  });
};