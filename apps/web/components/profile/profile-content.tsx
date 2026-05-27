"use client";

import { CoverLetterForm } from "@/components/profile/cover-letter-form";
import { CriteriaForm } from "@/components/profile/criteria-form";
import { LinkedInForm } from "@/components/profile/linkedin-form";
import { PersonalForm } from "@/components/profile/personal-form";
import { ProfileSkeleton } from "@/components/profile/profile-skeleton";
import { ResumeForm } from "@/components/profile/resume-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@repo/api";

type InitialData = RouterOutputs["profile"]["getProfile"];

export function ProfileContent({ initialData }: { initialData: InitialData }) {
  const { data, isLoading } = trpc.profile.getProfile.useQuery(undefined, { initialData });

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  const profile = data?.profile;
  const criteria = data?.criteria;

  return (
    <Tabs defaultValue="personal">
      <TabsList>
        <TabsTrigger value="personal">Personal</TabsTrigger>
        <TabsTrigger value="resume">Resume</TabsTrigger>
        <TabsTrigger value="cover-letter">Cover letter</TabsTrigger>
        <TabsTrigger value="criteria">Job criteria</TabsTrigger>
        <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
      </TabsList>
      <TabsContent value="personal" className="mt-4">
        <PersonalForm initial={profile} />
      </TabsContent>
      <TabsContent value="resume" className="mt-4">
        <ResumeForm initial={profile} />
      </TabsContent>
      <TabsContent value="cover-letter" className="mt-4">
        <CoverLetterForm initial={profile} />
      </TabsContent>
      <TabsContent value="criteria" className="mt-4">
        <CriteriaForm initial={criteria} />
      </TabsContent>
      <TabsContent value="linkedin" className="mt-4">
        <LinkedInForm savedEmail={data?.linkedinAccount?.email ?? null} />
      </TabsContent>
    </Tabs>
  );
}
