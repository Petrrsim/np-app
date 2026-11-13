"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDeleteEntry } from "@/hooks/use-entries";

export function DeleteEntryButton({ id }: { id: number }) {
  const del = useDeleteEntry();

  async function onConfirm() {
    try {
      await del.mutateAsync(id);
      toast.success("Entry deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete entry");
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete entry"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the log and its note. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
