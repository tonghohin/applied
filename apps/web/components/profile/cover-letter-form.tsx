"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { InitialProfile } from "./types";

const schema = z.object({
  coverLetterMarkdown: z.string().min(1, "Required"),
});

type FormValues = z.infer<typeof schema>;

export function CoverLetterForm({ initial }: { initial?: InitialProfile }) {
  const utils = trpc.useUtils();
  const { mutateAsync, isPending } = trpc.profile.upsertCoverLetter.useMutation({
    onSuccess: () => {
      toast.success("Cover letter saved");
      utils.profile.getProfile.invalidate();
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { coverLetterMarkdown: initial?.coverLetterMarkdown ?? "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await mutateAsync(values);
    } catch {
      toast.error("Failed to save cover letter");
    }
  }

  const loading = isSubmitting || isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Field data-invalid={!!errors.coverLetterMarkdown}>
        <FieldLabel htmlFor="coverLetterMarkdown">
          Cover letter template (Markdown) <span className="text-destructive">*</span>
        </FieldLabel>
        <Textarea
          id="coverLetterMarkdown"
          rows={20}
          placeholder="Dear Hiring Manager,..."
          {...register("coverLetterMarkdown")}
          aria-invalid={!!errors.coverLetterMarkdown}
        />
        <FieldError errors={[errors.coverLetterMarkdown]} />
      </Field>
      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
