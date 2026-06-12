"use client";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SearchSchedule } from "@repo/db";
import { SEARCH_SCHEDULE_DEFAULTS } from "@repo/shared";
import { format } from "date-fns";
import { useEffect, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FREQUENCY_OPTIONS = [
  { value: "1", label: "Hourly" },
  { value: "2", label: "Every 2 hours" },
  { value: "4", label: "Every 4 hours" },
  { value: "6", label: "Every 6 hours" },
];

// Jan 2 2000 is a Sunday, so index 0 lines up with cron day-of-week 0
const DAY_OPTIONS = Array.from({ length: 7 }, (_, day) => ({
  value: day,
  label: format(new Date(2000, 0, 2 + day), "EEEE"),
}));

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour: number) {
  return format(new Date(2000, 0, 1, hour), "h a");
}

function runsPerWeek(intervalHours: number, startHour: number, endHour: number, dayCount: number) {
  if (startHour > endHour || intervalHours < 1) return 0;
  return (Math.floor((endHour - startHour) / intervalHours) + 1) * dayCount;
}

const schema = z
  .object({
    enabled: z.boolean(),
    intervalHours: z.string(),
    startHour: z.string(),
    endHour: z.string(),
    days: z.array(z.number()).min(1, "Select at least one day"),
    timezone: z.string().min(1, "Required"),
  })
  .refine((values) => Number(values.startHour) <= Number(values.endHour), {
    message: "First run must not be after last run",
    path: ["startHour"],
  });

type FormValues = z.infer<typeof schema>;

export function ScheduleForm({ initial }: { initial: SearchSchedule | null }) {
  const utils = trpc.useUtils();
  const { mutateAsync, isPending } = trpc.profile.upsertSchedule.useMutation({
    onSuccess: () => {
      toast.success("Schedule saved");
      utils.profile.getProfile.invalidate();
    },
  });

  const {
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      enabled: initial?.enabled ?? SEARCH_SCHEDULE_DEFAULTS.enabled,
      intervalHours: String(initial?.intervalHours ?? SEARCH_SCHEDULE_DEFAULTS.intervalHours),
      startHour: String(initial?.startHour ?? SEARCH_SCHEDULE_DEFAULTS.startHour),
      endHour: String(initial?.endHour ?? SEARCH_SCHEDULE_DEFAULTS.endHour),
      days: initial?.days ?? [...SEARCH_SCHEDULE_DEFAULTS.days],
      timezone: initial?.timezone ?? "",
    },
  });

  // The browser's timezone is only known client-side; setting it after mount
  // keeps the SSR-rendered markup consistent with the first client render.
  useEffect(() => {
    if (!initial) {
      setValue("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
  }, [initial, setValue]);

  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  const enabled = useWatch({ control, name: "enabled" });
  const days = useWatch({ control, name: "days" });
  const intervalHours = useWatch({ control, name: "intervalHours" });
  const startHour = useWatch({ control, name: "startHour" });
  const endHour = useWatch({ control, name: "endHour" });

  const weeklyRuns = runsPerWeek(
    Number(intervalHours),
    Number(startHour),
    Number(endHour),
    days.length
  );

  // An interval longer than the active-hours window degrades to a single run at the
  // start hour, so the frequency would be a lie — gray those options out. Hourly stays
  // enabled as the baseline so the control always has a selectable option.
  const windowSpan = Number(endHour) - Number(startHour);

  function isIntervalDisabled(interval: number) {
    return interval !== 1 && interval > windowSpan;
  }

  async function onSubmit(values: FormValues) {
    try {
      await mutateAsync({
        enabled: values.enabled,
        intervalHours: Number(values.intervalHours),
        startHour: Number(values.startHour),
        endHour: Number(values.endHour),
        days: values.days,
        timezone: values.timezone,
      });
    } catch {
      toast.error("Failed to save schedule");
    }
  }

  const loading = isSubmitting || isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Switch
                id="enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                className="mt-0.5"
              />
            )}
          />
          <div className="flex flex-col gap-0.5">
            <FieldLabel htmlFor="enabled" className="cursor-pointer font-semibold">
              Automatically search for jobs
            </FieldLabel>
            <FieldDescription className="text-muted-foreground text-sm">
              Runs on your saved criteria — no manual searching.
            </FieldDescription>
          </div>
        </div>
        {enabled && (
          <span className="shrink-0 text-muted-foreground text-sm">
            <span className="font-medium text-primary">{weeklyRuns}</span> searches / week
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <div>
          <FieldLabel>Frequency</FieldLabel>
          <FieldDescription className="text-muted-foreground text-sm">
            How often a search runs.
          </FieldDescription>
        </div>
        <Controller
          control={control}
          name="intervalHours"
          render={({ field }) => (
            <ToggleGroup
              value={[field.value]}
              onValueChange={(groupValue) => {
                if (groupValue.length > 0) field.onChange(String(groupValue[0]));
              }}
              disabled={!enabled}
              variant="outline"
            >
              {FREQUENCY_OPTIONS.map(({ value, label }) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  disabled={isIntervalDisabled(Number(value))}
                  className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:aria-pressed:bg-primary/90 hover:aria-pressed:text-primary-foreground"
                >
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        />
      </div>

      <Field data-invalid={!!errors.startHour} className="flex flex-col gap-2.5">
        <div>
          <FieldLabel>Active hours</FieldLabel>
          <FieldDescription className="text-muted-foreground text-sm">
            Window searches run within, inclusive.
          </FieldDescription>
        </div>
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="startHour"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={!enabled}>
                <SelectTrigger aria-label="First run at" className="w-28">
                  <SelectValue>{hourLabel(Number(field.value))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>
                      {hourLabel(hour)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Controller
            control={control}
            name="endHour"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={!enabled}>
                <SelectTrigger aria-label="Last run at" className="w-28">
                  <SelectValue>{hourLabel(Number(field.value))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour} value={String(hour)} disabled={hour < Number(startHour)}>
                      {hourLabel(hour)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <FieldError errors={[errors.startHour, errors.endHour]} />
      </Field>

      <div className="flex flex-col gap-2.5">
        <div>
          <FieldLabel>Days</FieldLabel>
          <FieldDescription className="text-muted-foreground text-sm">
            Which days the agent searches.
          </FieldDescription>
        </div>
        <ToggleGroup
          multiple
          value={days.map(String)}
          onValueChange={(groupValue) => {
            const next = groupValue
              .map((entry) => Number(entry))
              .sort((first, second) => first - second);
            setValue("days", next, { shouldValidate: true });
          }}
          disabled={!enabled}
          variant="outline"
        >
          {DAY_OPTIONS.map(({ value, label }) => (
            <ToggleGroupItem
              key={value}
              value={String(value)}
              className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:aria-pressed:bg-primary/90 hover:aria-pressed:text-primary-foreground"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldError errors={[errors.days as { message?: string } | undefined]} />
      </div>

      <Field data-invalid={!!errors.timezone} className="flex flex-col gap-2.5">
        <div>
          <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
          <FieldDescription className="text-muted-foreground text-sm">
            Detected from your browser.
          </FieldDescription>
        </div>
        <Controller
          control={control}
          name="timezone"
          render={({ field }) => (
            <Combobox
              items={timezones}
              value={field.value || null}
              onValueChange={(value) => field.onChange(value ?? "")}
              disabled={!enabled}
            >
              <ComboboxInput
                id="timezone"
                placeholder="Search timezones…"
                className="w-full"
                aria-invalid={!!errors.timezone}
              />
              <ComboboxContent>
                <ComboboxEmpty>No timezone found.</ComboboxEmpty>
                <ComboboxList>
                  {(timezone: string) => (
                    <ComboboxItem key={timezone} value={timezone}>
                      {timezone}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          )}
        />
        <FieldError errors={[errors.timezone]} />
      </Field>

      <Button type="submit" disabled={loading} className="self-end">
        {loading ? "Saving…" : "Save schedule"}
      </Button>
    </form>
  );
}
