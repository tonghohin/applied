"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
const schema = z.object({
  linkedinEmail: z.email("Invalid email address"),
  linkedinPassword: z.string().min(1, "Required"),
});

type FormValues = z.infer<typeof schema>;

export function LinkedInForm() {
  const utils = trpc.useUtils();
  const { mutateAsync, isPending } = trpc.profile.upsertLinkedIn.useMutation({
    onSuccess: () => {
      toast.success("LinkedIn credentials saved");
      utils.profile.getProfile.invalidate();
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { linkedinEmail: "", linkedinPassword: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await mutateAsync(values);
    } catch {
      toast.error("Failed to save LinkedIn credentials");
    }
  }

  const loading = isSubmitting || isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Credentials are encrypted and never logged.</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="linkedinEmail">
          LinkedIn email <span className="text-destructive">*</span>
        </Label>
        <Input id="linkedinEmail" type="email" {...register("linkedinEmail")} />
        {errors.linkedinEmail && (
          <p className="text-sm text-destructive">{errors.linkedinEmail.message}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="linkedinPassword">
          LinkedIn password <span className="text-destructive">*</span>
        </Label>
        <Input id="linkedinPassword" type="password" {...register("linkedinPassword")} />
        {errors.linkedinPassword && (
          <p className="text-sm text-destructive">{errors.linkedinPassword.message}</p>
        )}
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
