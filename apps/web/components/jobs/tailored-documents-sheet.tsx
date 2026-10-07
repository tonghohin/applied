"use client";

import { TailoredDocumentEditor } from "@/components/jobs/tailored-document-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TAILORED_DOCUMENT_LABELS, tailoredDocumentFor } from "@/lib/tailored-documents";
import type { Job, TailoredDocuments } from "@/lib/trpc";
import { TAILORED_DOCUMENT_KINDS, type TailoredDocumentKind } from "@repo/shared";
import { useCallback, useState } from "react";

export function TailoredDocumentsSheet({
  job,
  documents,
  open,
  onOpenChange,
  activeKind,
  onActiveKindChange,
}: {
  job: Job;
  documents: TailoredDocuments | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeKind: TailoredDocumentKind;
  onActiveKindChange: (kind: TailoredDocumentKind) => void;
}) {
  const [dirtyKinds, setDirtyKinds] = useState<TailoredDocumentKind[]>([]);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const handleDirtyChange = useCallback((kind: TailoredDocumentKind, isDirty: boolean) => {
    setDirtyKinds((current) => {
      if (isDirty === current.includes(kind)) return current;
      return isDirty ? [...current, kind] : current.filter((dirtyKind) => dirtyKind !== kind);
    });
  }, []);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && dirtyKinds.length > 0) {
      setConfirmDiscardOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  }

  function handleDiscard() {
    setConfirmDiscardOpen(false);
    setDirtyKinds([]);
    onOpenChange(false);
  }

  const unsavedLabels = dirtyKinds
    .map((kind) => TAILORED_DOCUMENT_LABELS[kind].toLowerCase())
    .join(" and ");

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full data-[side=right]:sm:max-w-6xl">
          <SheetHeader className="pr-12">
            <SheetTitle>Tailored documents</SheetTitle>
            <SheetDescription>
              {job.title} at {job.company}. Edit, preview, and download before you apply.
            </SheetDescription>
          </SheetHeader>
          <Tabs
            value={activeKind}
            onValueChange={(value) => {
              const kind = TAILORED_DOCUMENT_KINDS.find((candidate) => candidate === value);
              if (kind) onActiveKindChange(kind);
            }}
            className="min-h-0 flex-1 px-4 pb-4"
          >
            <TabsList>
              {TAILORED_DOCUMENT_KINDS.map((kind) => (
                <TabsTrigger key={kind} value={kind}>
                  {TAILORED_DOCUMENT_LABELS[kind]}
                  {dirtyKinds.includes(kind) && (
                    <>
                      <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                      <span className="sr-only">(unsaved)</span>
                    </>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            {TAILORED_DOCUMENT_KINDS.map((kind) => (
              // keepMounted so switching tabs never throws away unsaved edits
              <TabsContent key={kind} value={kind} keepMounted className="min-h-0">
                <TailoredDocumentEditor
                  jobId={job.id}
                  kind={kind}
                  document={tailoredDocumentFor(documents, kind)}
                  onDirtyChange={handleDirtyChange}
                />
              </TabsContent>
            ))}
          </Tabs>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to the {unsavedLabels} haven't been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
