"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  phone: z.string().min(1, "Required"),
  address: z.string().min(1, "Required"),
  linkedinUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
  resumeMarkdown: z.string().min(1, "Required"),
  coverLetterMarkdown: z.string().min(1, "Required"),
  linkedinEmail: z.string().optional(),
  linkedinPassword: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  tab: "personal" | "resume" | "cover-letter" | "linkedin";
  initial?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: string;
    linkedinUrl?: string | null;
    githubUrl?: string | null;
    websiteUrl?: string | null;
    resumeMarkdown?: string;
    coverLetterMarkdown?: string;
  } | null;
}

export function ProfileForm({ tab, initial }: Props) {
  const utils = trpc.useUtils();
  const { mutateAsync, isPending } = trpc.profile.upsertProfile.useMutation({
    onSuccess: () => utils.profile.getProfile.invalidate(),
  });

  const {
    register,
    handleSubmit,
    setError,
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
      resumeMarkdown: initial?.resumeMarkdown ?? "",
      coverLetterMarkdown: initial?.coverLetterMarkdown ?? "",
      linkedinEmail: "",
      linkedinPassword: "",
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      await mutateAsync(values);
    } catch {
      setError("root", { message: "Failed to save profile" });
    }
  }

  const loading = isSubmitting || isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {tab === "personal" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" {...register("firstName")} />
              {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" {...register("lastName")} />
              {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" {...register("phone")} />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address">Address</Label>
            <Input id="address" {...register("address")} />
            {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
            <Input id="linkedinUrl" type="url" placeholder="https://linkedin.com/in/you" {...register("linkedinUrl")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="githubUrl">GitHub URL</Label>
            <Input id="githubUrl" type="url" placeholder="https://github.com/you" {...register("githubUrl")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="websiteUrl">Website URL</Label>
            <Input id="websiteUrl" type="url" placeholder="https://yoursite.com" {...register("websiteUrl")} />
          </div>
        </>
      )}

      {tab === "resume" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="resumeMarkdown">Resume (Markdown)</Label>
          <Textarea id="resumeMarkdown" rows={20} placeholder="# Your Name&#10;&#10;## Experience..." {...register("resumeMarkdown")} />
          {errors.resumeMarkdown && <p className="text-sm text-destructive">{errors.resumeMarkdown.message}</p>}
        </div>
      )}

      {tab === "cover-letter" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="coverLetterMarkdown">Cover letter template (Markdown)</Label>
          <Textarea id="coverLetterMarkdown" rows={20} placeholder="Dear Hiring Manager,..." {...register("coverLetterMarkdown")} />
          {errors.coverLetterMarkdown && (
            <p className="text-sm text-destructive">{errors.coverLetterMarkdown.message}</p>
          )}
        </div>
      )}

      {tab === "linkedin" && (
        <>
          <p className="text-sm text-muted-foreground">
            Credentials are encrypted and never logged. Leave blank to keep existing values.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="linkedinEmail">LinkedIn email</Label>
            <Input id="linkedinEmail" type="email" {...register("linkedinEmail")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="linkedinPassword">LinkedIn password</Label>
            <Input id="linkedinPassword" type="password" {...register("linkedinPassword")} />
          </div>
        </>
      )}

      {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
