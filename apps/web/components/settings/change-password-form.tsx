"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export function ChangePasswordForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: FormValues) {
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      const message =
        error.code === "INVALID_PASSWORD"
          ? "Current password is incorrect"
          : error.code === "PASSWORD_TOO_SHORT"
            ? "New password is too short"
            : (error.message ?? "Failed to change password");
      toast.error(message);
    } else {
      toast.success("Password changed. You've been signed out of other devices.");
      reset();
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto flex max-w-6xl flex-col gap-4">
      <Field data-invalid={!!errors.currentPassword}>
        <FieldLabel htmlFor="currentPassword">
          Current password <span className="text-destructive">*</span>
        </FieldLabel>
        <PasswordInput
          id="currentPassword"
          {...register("currentPassword")}
          aria-invalid={!!errors.currentPassword}
        />
        <FieldError errors={[errors.currentPassword]} />
      </Field>
      <Field data-invalid={!!errors.newPassword}>
        <FieldLabel htmlFor="newPassword">
          New password <span className="text-destructive">*</span>
        </FieldLabel>
        <PasswordInput
          id="newPassword"
          {...register("newPassword")}
          aria-invalid={!!errors.newPassword}
        />
        <FieldError errors={[errors.newPassword]} />
      </Field>
      <Field data-invalid={!!errors.confirmPassword}>
        <FieldLabel htmlFor="confirmPassword">
          Confirm new password <span className="text-destructive">*</span>
        </FieldLabel>
        <PasswordInput
          id="confirmPassword"
          {...register("confirmPassword")}
          aria-invalid={!!errors.confirmPassword}
        />
        <FieldError errors={[errors.confirmPassword]} />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="self-end">
        {isSubmitting ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
