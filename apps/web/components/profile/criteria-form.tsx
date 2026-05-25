"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { WORK_TYPES, splitCsv } from "@repo/shared";
import type { LocationEntry, WorkType } from "@repo/shared";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

const WORK_TYPE_OPTIONS: { value: WorkType; label: string }[] = [
  { value: "on-site", label: "On-site" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
];

const locationSchema = z.object({
  location: z.string().min(1, "Required"),
  workTypes: z.array(z.enum(WORK_TYPES)).min(1, "Select at least one"),
});

const schema = z.object({
  jobTitles: z.string().min(1, "Required"),
  skills: z.string().min(1, "Required"),
  locations: z.array(locationSchema).min(1, "Add at least one location"),
  seniority: z.string(),
  minSalary: z.string(),
});

type FormValues = z.infer<typeof schema>;


export function CriteriaForm({
  initial,
}: {
  initial?: {
    jobTitles?: string[];
    skills?: string[];
    locations?: LocationEntry[] | null;
    seniority?: string[];
    minSalary?: number | null;
  } | null;
}) {
  const utils = trpc.useUtils();
  const { mutateAsync, isPending } = trpc.profile.upsertCriteria.useMutation({
    onSuccess: () => {
      toast.success("Job criteria saved");
      utils.profile.getProfile.invalidate();
    },
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      jobTitles: initial?.jobTitles?.join(", ") ?? "",
      skills: initial?.skills?.join(", ") ?? "",
      locations: initial?.locations ?? [],
      seniority: initial?.seniority?.join(", ") ?? "",
      minSalary: initial?.minSalary?.toString() ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "locations" });
  const locations = useWatch({ control, name: "locations" });

  function addLocation() {
    append({ location: "", workTypes: ["on-site", "remote", "hybrid"] });
  }

  function toggleWorkType(index: number, type: WorkType) {
    const current = locations[index]?.workTypes ?? [];
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setValue(`locations.${index}.workTypes`, next as WorkType[], { shouldValidate: true });
  }

  async function onSubmit(values: FormValues) {
    try {
      await mutateAsync({
        jobTitles: splitCsv(values.jobTitles),
        skills: splitCsv(values.skills),
        locations: values.locations,
        seniority: splitCsv(values.seniority),
        minSalary: values.minSalary ? Number(values.minSalary) : undefined,
      });
    } catch {
      toast.error("Failed to save job criteria");
    }
  }

  const loading = isSubmitting || isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="jobTitles">
          Job titles (comma-separated) <span className="text-destructive">*</span>
        </Label>
        <Input
          id="jobTitles"
          placeholder="Software Engineer, Frontend Developer"
          {...register("jobTitles")}
        />
        {errors.jobTitles && (
          <p className="text-sm text-destructive">{errors.jobTitles.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="skills">
          Skills (comma-separated) <span className="text-destructive">*</span>
        </Label>
        <Input id="skills" placeholder="React, TypeScript, Node.js" {...register("skills")} />
        {errors.skills && <p className="text-sm text-destructive">{errors.skills.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>
            Locations <span className="text-destructive">*</span>
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addLocation}>
            Add location
          </Button>
        </div>

        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground">No locations added yet.</p>
        )}

        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Toronto, Canada, New York…"
                {...register(`locations.${index}.location`)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(index)}
                className="shrink-0 text-muted-foreground"
              >
                Remove
              </Button>
            </div>
            {errors.locations?.[index]?.location && (
              <p className="text-sm text-destructive">
                {errors.locations[index].location?.message}
              </p>
            )}
            <div className="flex gap-4">
              {WORK_TYPE_OPTIONS.map(({ value, label }) => {
                const id = `wt-${index}-${value}`;
                return (
                  <div key={value} className="flex cursor-pointer items-center gap-1.5">
                    <Checkbox
                      id={id}
                      checked={locations[index]?.workTypes?.includes(value) ?? false}
                      onCheckedChange={() => toggleWorkType(index, value)}
                    />
                    <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                      {label}
                    </Label>
                  </div>
                );
              })}
            </div>
            {errors.locations?.[index]?.workTypes && (
              <p className="text-sm text-destructive">
                {errors.locations[index].workTypes?.message}
              </p>
            )}
          </div>
        ))}

        {typeof errors.locations?.message === "string" && (
          <p className="text-sm text-destructive">{errors.locations.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seniority">Seniority levels (comma-separated)</Label>
        <Input id="seniority" placeholder="Mid, Senior" {...register("seniority")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="minSalary">Minimum salary (USD)</Label>
        <Input id="minSalary" type="number" placeholder="100000" {...register("minSalary")} />
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save criteria"}
      </Button>
    </form>
  );
}
