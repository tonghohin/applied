"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { InitialProfile } from "./types";

const schema = z.object({
  coverLetterInstructions: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CoverLetterForm({ initial }: { initial?: InitialProfile }) {
  const utils = trpc.useUtils();
  const { mutateAsync, isPending } = trpc.profile.upsertCoverLetter.useMutation({
    onSuccess: () => {
      toast.success("Cover letter instructions saved");
      utils.profile.getProfile.invalidate();
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { coverLetterInstructions: initial?.coverLetterInstructions ?? "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await mutateAsync(values);
    } catch {
      toast.error("Failed to save cover letter instructions");
    }
  }

  const loading = isSubmitting || isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Field data-invalid={!!errors.coverLetterInstructions}>
        <FieldLabel htmlFor="coverLetterInstructions">Cover letter instructions</FieldLabel>
        <Textarea
          id="coverLetterInstructions"
          rows={6}
          placeholder="e.g. Keep it under 200 words. Mention my open source work. Formal but warm tone."
          {...register("coverLetterInstructions")}
          aria-invalid={!!errors.coverLetterInstructions}
        />
        <FieldDescription>
          Optionally describe your preferred tone, length, or things to emphasize. The AI will write
          a personalized cover letter for each company and role using your resume — no instructions
          needed to get started.
        </FieldDescription>
        <FieldError errors={[errors.coverLetterInstructions]} />
      </Field>
      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
