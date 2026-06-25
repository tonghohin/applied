"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  aiGatewayKey: z.string().min(1, "Required"),
});

type FormValues = z.infer<typeof schema>;

export function AiForm({ initial }: { initial: { hasAiKey: boolean } }) {
  const { mutateAsync, isPending, isSuccess } = trpc.profile.upsertAiKey.useMutation({
    onSuccess: () => {
      toast.success("AI API key saved");
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { aiGatewayKey: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await mutateAsync(values);
    } catch {
      toast.error("Failed to save AI API key");
    }
  }

  const loading = isSubmitting || isPending;
  const hasKey = initial.hasAiKey || isSuccess;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto flex max-w-6xl flex-col gap-4">
      <Field data-invalid={!!errors.aiGatewayKey}>
        <FieldLabel htmlFor="aiGatewayKey">
          AI Gateway API key <span className="text-destructive">*</span>
          {hasKey && (
            <Badge variant="secondary" className="ml-2">
              Key saved
            </Badge>
          )}
        </FieldLabel>
        <PasswordInput
          id="aiGatewayKey"
          {...register("aiGatewayKey")}
          aria-invalid={!!errors.aiGatewayKey}
        />
        <FieldDescription>
          Get your key at{" "}
          <a
            href="https://v0.dev/gateway"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            v0.dev/gateway
          </a>
          . The key is encrypted and never shown after saving.
        </FieldDescription>
        <FieldError errors={[errors.aiGatewayKey]} />
      </Field>
      <Button type="submit" disabled={loading} className="self-end">
        {loading ? "Saving…" : hasKey ? "Update key" : "Save key"}
      </Button>
    </form>
  );
}
