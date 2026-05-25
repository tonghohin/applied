"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { InitialProfile } from "./types";

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  phone: z.string().min(1, "Required"),
  address: z.string().min(1, "Required"),
  linkedinUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function PersonalForm({ initial }: { initial?: InitialProfile }) {
  const utils = trpc.useUtils();
  const { mutateAsync, isPending } = trpc.profile.upsertPersonal.useMutation({
    onSuccess: () => {
      toast.success("Personal info saved");
      utils.profile.getProfile.invalidate();
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: initial?.firstName ?? "",
      lastName: initial?.lastName ?? "",
      phone: initial?.phone ?? "",
      address: initial?.address ?? "",
      linkedinUrl: initial?.linkedinUrl ?? "",
      githubUrl: initial?.githubUrl ?? "",
      websiteUrl: initial?.websiteUrl ?? "",
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      await mutateAsync(values);
    } catch {
      toast.error("Failed to save personal info");
    }
  }

  const loading = isSubmitting || isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field data-invalid={!!errors.firstName}>
          <FieldLabel htmlFor="firstName">
            First name <span className="text-destructive">*</span>
          </FieldLabel>
          <Input id="firstName" {...register("firstName")} aria-invalid={!!errors.firstName} />
          <FieldError errors={[errors.firstName]} />
        </Field>
        <Field data-invalid={!!errors.lastName}>
          <FieldLabel htmlFor="lastName">
            Last name <span className="text-destructive">*</span>
          </FieldLabel>
          <Input id="lastName" {...register("lastName")} aria-invalid={!!errors.lastName} />
          <FieldError errors={[errors.lastName]} />
        </Field>
      </div>
      <Field data-invalid={!!errors.phone}>
        <FieldLabel htmlFor="phone">
          Phone <span className="text-destructive">*</span>
        </FieldLabel>
        <Input id="phone" type="tel" {...register("phone")} aria-invalid={!!errors.phone} />
        <FieldError errors={[errors.phone]} />
      </Field>
      <Field data-invalid={!!errors.address}>
        <FieldLabel htmlFor="address">
          Address <span className="text-destructive">*</span>
        </FieldLabel>
        <Input id="address" {...register("address")} aria-invalid={!!errors.address} />
        <FieldError errors={[errors.address]} />
      </Field>
      <Field>
        <FieldLabel htmlFor="linkedinUrl">LinkedIn URL</FieldLabel>
        <Input
          id="linkedinUrl"
          type="url"
          placeholder="https://linkedin.com/in/you"
          {...register("linkedinUrl")}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="githubUrl">GitHub URL</FieldLabel>
        <Input
          id="githubUrl"
          type="url"
          placeholder="https://github.com/you"
          {...register("githubUrl")}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="websiteUrl">Website URL</FieldLabel>
        <Input
          id="websiteUrl"
          type="url"
          placeholder="https://yoursite.com"
          {...register("websiteUrl")}
        />
      </Field>
      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
