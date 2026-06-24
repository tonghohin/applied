"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import type { LocationEntry, WorkType } from "@repo/shared";
import { WORK_TYPES, splitCsv } from "@repo/shared";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
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
  jobTitle: z.string().min(1, "Required"),
  skills: z.string().min(1, "Required"),
  locations: z.array(locationSchema).min(1, "Add at least one location"),
  seniority: z.string(),
  excludeKeywords: z.string(),
  excludeCompanies: z.string(),
  minSalary: z.string().min(1, "Required"),
  skipDuplicateIdentity: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function CriteriaForm({
  initial,
}: {
  initial?: {
    jobTitle?: string;
    skills?: string[];
    locations?: LocationEntry[] | null;
    seniority?: string[];
    excludeKeywords?: string[] | null;
    excludeCompanies?: string[] | null;
    minSalary?: number | null;
    skipDuplicateIdentity?: boolean | null;
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
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      jobTitle: initial?.jobTitle ?? "",
      skills: initial?.skills?.join(", ") ?? "",
      locations: initial?.locations ?? [],
      seniority: initial?.seniority?.join(", ") ?? "",
      excludeKeywords: initial?.excludeKeywords?.join(", ") ?? "",
      excludeCompanies: initial?.excludeCompanies?.join(", ") ?? "",
      minSalary: initial?.minSalary?.toString() ?? "",
      skipDuplicateIdentity: initial?.skipDuplicateIdentity ?? true,
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
      ? current.filter((entry) => entry !== type)
      : [...current, type];
    setValue(`locations.${index}.workTypes`, next as WorkType[], { shouldValidate: true });
  }

  async function onSubmit(values: FormValues) {
    try {
      await mutateAsync({
        jobTitle: values.jobTitle,
        skills: splitCsv(values.skills),
        locations: values.locations,
        seniority: splitCsv(values.seniority),
        excludeKeywords: splitCsv(values.excludeKeywords),
        excludeCompanies: splitCsv(values.excludeCompanies),
        minSalary: Number(values.minSalary),
        skipDuplicateIdentity: values.skipDuplicateIdentity,
      });
    } catch {
      toast.error("Failed to save job criteria");
    }
  }

  const loading = isSubmitting || isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto flex max-w-6xl flex-col gap-4">
      <Field data-invalid={!!errors.jobTitle}>
        <FieldLabel htmlFor="jobTitle">
          Job title <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="jobTitle"
          placeholder="Software Engineer"
          {...register("jobTitle")}
          aria-invalid={!!errors.jobTitle}
        />
        <FieldError errors={[errors.jobTitle]} />
      </Field>

      <Field data-invalid={!!errors.skills}>
        <FieldLabel htmlFor="skills">
          Skills (comma-separated) <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="skills"
          placeholder="React, TypeScript, Node.js"
          {...register("skills")}
          aria-invalid={!!errors.skills}
        />
        <FieldDescription>Used to score how well a job matches your profile.</FieldDescription>
        <FieldError errors={[errors.skills]} />
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <FieldLabel>
            Locations <span className="text-destructive">*</span>
          </FieldLabel>
          <Button type="button" variant="outline" size="sm" onClick={addLocation}>
            Add location
          </Button>
        </div>

        {fields.length === 0 && (
          <p className="text-muted-foreground text-sm">No locations added yet.</p>
        )}

        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Field data-invalid={!!errors.locations?.[index]?.location} className="flex-1">
                <Input
                  placeholder="Toronto, Canada, New York…"
                  {...register(`locations.${index}.location`)}
                  aria-invalid={!!errors.locations?.[index]?.location}
                />
                <FieldError errors={[errors.locations?.[index]?.location]} />
              </Field>
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
            <div className="flex gap-2 self-start">
              {WORK_TYPE_OPTIONS.map(({ value, label }) => {
                const id = `wt-${index}-${value}`;
                return (
                  <Field key={value} orientation="horizontal">
                    <Checkbox
                      id={id}
                      checked={locations[index]?.workTypes?.includes(value) ?? false}
                      onCheckedChange={() => toggleWorkType(index, value)}
                    />
                    <FieldLabel
                      htmlFor={id}
                      className="cursor-pointer whitespace-nowrap font-normal"
                    >
                      {label}
                    </FieldLabel>
                  </Field>
                );
              })}
            </div>
            <FieldError errors={[errors.locations?.[index]?.workTypes]} />
          </div>
        ))}

        <FieldError errors={[errors.locations as { message?: string } | undefined]} />
      </div>

      <Field>
        <FieldLabel htmlFor="excludeKeywords">Exclude keywords (comma-separated)</FieldLabel>
        <Input
          id="excludeKeywords"
          placeholder="Java, PHP, Unpaid"
          {...register("excludeKeywords")}
        />
        <FieldDescription>
          Jobs whose title contains any of these words will be skipped entirely.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="excludeCompanies">Exclude companies (comma-separated)</FieldLabel>
        <Input
          id="excludeCompanies"
          placeholder="Acme Corp, Globex"
          {...register("excludeCompanies")}
        />
        <FieldDescription>
          Jobs from any of these companies will be skipped entirely.
        </FieldDescription>
      </Field>

      <Field orientation="horizontal">
        <Checkbox
          id="skipDuplicateIdentity"
          checked={!!watch("skipDuplicateIdentity")}
          onCheckedChange={(checked) =>
            setValue("skipDuplicateIdentity", !!checked, { shouldDirty: true })
          }
        />
        <div>
          <FieldLabel htmlFor="skipDuplicateIdentity" className="cursor-pointer">
            Skip duplicate postings
          </FieldLabel>
          <FieldDescription>
            Skip jobs where the same company, title, and location already exist in your list.
          </FieldDescription>
        </div>
      </Field>

      <Field>
        <FieldLabel htmlFor="seniority">Seniority levels (comma-separated)</FieldLabel>
        <Input id="seniority" placeholder="Mid, Senior" {...register("seniority")} />
      </Field>

      <Field data-invalid={!!errors.minSalary}>
        <FieldLabel htmlFor="minSalary">Minimum salary</FieldLabel>
        <Input
          id="minSalary"
          type="number"
          placeholder="100000"
          {...register("minSalary")}
          aria-invalid={!!errors.minSalary}
        />
        <FieldError errors={[errors.minSalary]} />
      </Field>

      <Button type="submit" disabled={loading} className="self-end">
        {loading ? "Saving…" : "Save criteria"}
      </Button>
    </form>
  );
}
