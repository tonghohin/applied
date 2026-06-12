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
  resume: z.string().min(1, "Required"),
});

type FormValues = z.infer<typeof schema>;

export function ResumeForm({ initial }: { initial?: InitialProfile }) {
  const utils = trpc.useUtils();
  const { mutateAsync, isPending } = trpc.profile.upsertResume.useMutation({
    onSuccess: () => {
      toast.success("Resume saved");
      utils.profile.getProfile.invalidate();
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { resume: initial?.resume ?? "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await mutateAsync(values);
    } catch {
      toast.error("Failed to save resume");
    }
  }

  const loading = isSubmitting || isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto flex max-w-6xl flex-col gap-4">
      <Field data-invalid={!!errors.resume}>
        <FieldLabel htmlFor="resume">
          Resume <span className="text-destructive">*</span>
        </FieldLabel>
        <Textarea
          id="resume"
          rows={20}
          placeholder="Paste your resume here..."
          {...register("resume")}
          aria-invalid={!!errors.resume}
        />
        <FieldError errors={[errors.resume]} />
      </Field>
      <Button type="submit" disabled={loading} className="self-end">
        {loading ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
