import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SETTINGS_PAGES } from "@/lib/settings-pages";
import { RiArrowRightLine, RiSettings3Line } from "@remixicon/react";
import type { MissingSearchField } from "@repo/shared";
import Link from "next/link";

export function SetupRequiredEmpty({ missingFields }: { missingFields: MissingSearchField[] }) {
  const missingSections = [...new Set(missingFields.map((field) => field.section))];
  const firstSection = missingSections[0];

  return (
    <Empty className="min-h-80 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RiSettings3Line />
        </EmptyMedia>
        <EmptyContent>
          <EmptyTitle>Finish setting up your profile</EmptyTitle>
          <EmptyDescription>
            Complete these settings before searching for jobs:{" "}
            {missingSections.map((section) => SETTINGS_PAGES[section].label).join(", ")}.
          </EmptyDescription>
        </EmptyContent>
        {firstSection && (
          <Button nativeButton={false} render={<Link href={SETTINGS_PAGES[firstSection].href} />}>
            Go to {SETTINGS_PAGES[firstSection].label} <RiArrowRightLine />
          </Button>
        )}
      </EmptyHeader>
    </Empty>
  );
}
