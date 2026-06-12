"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
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

export function LinkedInForm({ savedEmail }: { savedEmail: string | null }) {
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
    defaultValues: { linkedinEmail: savedEmail ?? "", linkedinPassword: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await mutateAsync(values);
    } catch {
      toast.error("Failed to save LinkedIn credentials");
    }
  }

  const loading = isSubmitting || isPending;
  const hasCredentials = savedEmail !== null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto flex max-w-6xl flex-col gap-4">
      <Field data-invalid={!!errors.linkedinEmail}>
        <FieldLabel htmlFor="linkedinEmail">
          LinkedIn email <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="linkedinEmail"
          type="email"
          {...register("linkedinEmail")}
          aria-invalid={!!errors.linkedinEmail}
        />
        <FieldError errors={[errors.linkedinEmail]} />
      </Field>
      <Field data-invalid={!!errors.linkedinPassword}>
        <FieldLabel htmlFor="linkedinPassword">
          LinkedIn password <span className="text-destructive">*</span>
        </FieldLabel>
        <PasswordInput
          id="linkedinPassword"
          {...register("linkedinPassword")}
          aria-invalid={!!errors.linkedinPassword}
        />
        <FieldDescription>
          Password is encrypted and never logged. For security, saved passwords are never shown.
        </FieldDescription>
        <FieldError errors={[errors.linkedinPassword]} />
      </Field>
      <Button type="submit" disabled={loading} className="self-end">
        {loading ? "Saving…" : hasCredentials ? "Update credentials" : "Save credentials"}
      </Button>
    </form>
  );
}
