"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

const schema = z.object({
  jobTitles: z.string(),
  skills: z.string(),
  locations: z.string(),
  remote: z.boolean(),
  seniority: z.string(),
  minSalary: z.string(),
});

type FormValues = z.infer<typeof schema>;

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface Props {
  initial?: {
    jobTitles?: string[];
    skills?: string[];
    locations?: string[];
    remote?: boolean;
    seniority?: string[];
    minSalary?: number | null;
  } | null;
}

export function CriteriaForm({ initial }: Props) {
  const utils = trpc.useUtils();
  const { mutateAsync, isPending } = trpc.profile.upsertCriteria.useMutation({
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
      jobTitles: initial?.jobTitles?.join(", ") ?? "",
      skills: initial?.skills?.join(", ") ?? "",
      locations: initial?.locations?.join(", ") ?? "",
      remote: initial?.remote ?? false,
      seniority: initial?.seniority?.join(", ") ?? "",
      minSalary: initial?.minSalary?.toString() ?? "",
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      await mutateAsync({
        jobTitles: splitCsv(values.jobTitles),
        skills: splitCsv(values.skills),
        locations: splitCsv(values.locations),
        remote: values.remote,
        seniority: splitCsv(values.seniority),
        minSalary: values.minSalary ? Number(values.minSalary) : undefined,
      });
    } catch {
      setError("root", { message: "Failed to save criteria" });
    }
  }

  const loading = isSubmitting || isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="jobTitles">Job titles (comma-separated)</Label>
        <Input id="jobTitles" placeholder="Software Engineer, Frontend Developer" {...register("jobTitles")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="skills">Skills (comma-separated)</Label>
        <Input id="skills" placeholder="React, TypeScript, Node.js" {...register("skills")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="locations">Locations (comma-separated)</Label>
        <Input id="locations" placeholder="New York, Remote" {...register("locations")} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="remote" {...register("remote")} className="h-4 w-4" />
        <Label htmlFor="remote">Remote only</Label>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seniority">Seniority levels (comma-separated)</Label>
        <Input id="seniority" placeholder="Mid, Senior" {...register("seniority")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="minSalary">Minimum salary (USD)</Label>
        <Input id="minSalary" type="number" placeholder="100000" {...register("minSalary")} />
      </div>
      {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save criteria"}
      </Button>
    </form>
  );
}
