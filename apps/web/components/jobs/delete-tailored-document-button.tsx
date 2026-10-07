"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDeleteTailoredDocument } from "@/hooks/use-delete-tailored-document";
import { TAILORED_DOCUMENT_LABELS } from "@/lib/tailored-documents";
import { RiDeleteBinLine } from "@remixicon/react";
import type { TailoredDocumentKind } from "@repo/shared";
import { useState } from "react";

export function DeleteTailoredDocumentButton({
  jobId,
  kind,
  iconOnly = false,
  disabled = false,
}: {
  jobId: string;
  kind: TailoredDocumentKind;
  iconOnly?: boolean;
  disabled?: boolean;
}) {
  const { deleteDocument, isDeleting } = useDeleteTailoredDocument(jobId);
  const [open, setOpen] = useState(false);
  const label = TAILORED_DOCUMENT_LABELS[kind].toLowerCase();

  async function handleDelete() {
    if (await deleteDocument(kind)) setOpen(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size={iconOnly ? "icon-sm" : "default"}
            aria-label={iconOnly ? `Delete ${label}` : undefined}
            disabled={disabled || isDeleting}
          />
        }
      >
        <RiDeleteBinLine data-icon={iconOnly ? undefined : "inline-start"} />
        {iconOnly ? null : "Delete"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            {kind === "resume"
              ? "Your edits are lost. If you apply with the agent later, it creates a new tailored resume first."
              : "Your edits are lost. If you apply with the agent later, it only writes a cover letter when the form asks for one."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={handleDelete}>
            {isDeleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
