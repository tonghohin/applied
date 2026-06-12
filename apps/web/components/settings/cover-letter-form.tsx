"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
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
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto flex max-w-6xl flex-col gap-4">
      <Field data-invalid={!!errors.coverLetterInstructions}>
        <Textarea
          id="coverLetterInstructions"
          aria-label="Cover letter instructions"
          rows={6}
          placeholder="e.g. Keep it under 200 words. Mention my open source work. Formal but warm tone."
          {...register("coverLetterInstructions")}
          aria-invalid={!!errors.coverLetterInstructions}
        />
        <FieldError errors={[errors.coverLetterInstructions]} />
      </Field>
      <Button type="submit" disabled={loading} className="self-end">
        {loading ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
