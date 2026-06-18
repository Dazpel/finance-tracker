"use client";

import React, { useCallback } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@heroui/react";
import { VerticalDotsIcon } from "assets/icons/VerticalDotsIcon";

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface NotesTableProps {
  notes: Note[];
  onEditNote: (note: Note) => void;
  onDeleteNote: (noteId: string) => void;
  isLoading?: boolean;
}

export const NotesTable = ({
  notes,
  onEditNote,
  onDeleteNote,
  isLoading = false,
}: NotesTableProps): React.ReactElement => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + "...";
  };

  const columns = [
    { name: "TITLE", uid: "title" },
    { name: "PREVIEW", uid: "preview" },
    { name: "CREATED", uid: "createdAt" },
    { name: "LAST UPDATED", uid: "updatedAt" },
    { name: "ACTIONS", uid: "actions" },
  ];

  const renderCell = useCallback((note: Note, columnKey: React.Key) => {
    switch (columnKey) {
      case "title":
        return (
          <div className="flex flex-col">
            <p className="text-bold text-sm capitalize font-semibold text-default-700">
              {note.title}
            </p>
          </div>
        );
      case "preview":
        return (
          <div className="max-w-xs">
            <p className="text-sm text-default-500 truncate">
              {truncateContent(note.content.replace(/<[^>]*>/g, ""), 80)}
            </p>
          </div>
        );
      case "createdAt":
        return (
          <div className="flex flex-col">
            <p className="text-bold text-sm text-default-700">
              {formatDate(note.createdAt)}
            </p>
          </div>
        );
      case "updatedAt":
        return (
          <div className="flex flex-col">
            <p className="text-bold text-sm text-default-700">
              {formatDate(note.updatedAt)}
            </p>
            {note.updatedAt !== note.createdAt && (
              <Chip size="sm" variant="flat" color="secondary">
                Modified
              </Chip>
            )}
          </div>
        );
      case "actions":
        return (
          <div className="text-center">
            <Dropdown aria-label="actions dropdown">
              <DropdownTrigger>
                <Button isIconOnly size="sm" variant="light">
                  <VerticalDotsIcon className="text-default-300" />
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="dropdown options">
                <DropdownItem key="edit button" onPress={() => onEditNote(note)}>
                  Edit
                </DropdownItem>
                <DropdownItem key="delete button" onPress={() => onDeleteNote(note.id)}>
                  Delete
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        );
      default:
        return null;
    }
  }, [onEditNote, onDeleteNote]);

  return (
    <div className="w-full">
      <Table
        aria-label="Notes table"
        classNames={{
          wrapper: "min-h-[222px]",
        }}
      >
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn
              key={column.uid}
              align={column.uid === "actions" ? "center" : "start"}
            >
              {column.name}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody
          items={notes}
          loadingContent="Loading notes..."
          loadingState={isLoading ? "loading" : "idle"}
          emptyContent="No notes found. Create your first note!"
        >
          {(item) => (
            <TableRow key={item.id}>
              {(columnKey) => (
                <TableCell>{renderCell(item, columnKey)}</TableCell>
              )}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};