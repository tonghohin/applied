"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { InitialProfile } from "./types";

const schema = z.object({
  resumeMarkdown: z.string().min(1, "Required"),
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
    defaultValues: { resumeMarkdown: initial?.resumeMarkdown ?? "" },
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="resumeMarkdown">
          Resume (Markdown) <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="resumeMarkdown"
          rows={20}
          placeholder="# Your Name&#10;&#10;## Experience..."
          {...register("resumeMarkdown")}
        />
        {errors.resumeMarkdown && (
          <p className="text-sm text-destructive">{errors.resumeMarkdown.message}</p>
        )}
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
