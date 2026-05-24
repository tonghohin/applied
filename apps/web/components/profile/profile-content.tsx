"use client";

import { CriteriaForm } from "@/components/profile/criteria-form";
import { ProfileForm } from "@/components/profile/profile-form";
import { ProfileSkeleton } from "@/components/profile/profile-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";

export function ProfileContent() {
  const { data, isLoading } = trpc.profile.getProfile.useQuery();

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
        <ProfileForm tab="personal" initial={profile} />
      </TabsContent>
      <TabsContent value="resume" className="mt-4">
        <ProfileForm tab="resume" initial={profile} />
      </TabsContent>
      <TabsContent value="cover-letter" className="mt-4">
        <ProfileForm tab="cover-letter" initial={profile} />
      </TabsContent>
      <TabsContent value="criteria" className="mt-4">
        <CriteriaForm initial={criteria} />
      </TabsContent>
      <TabsContent value="linkedin" className="mt-4">
        <ProfileForm tab="linkedin" initial={profile} />
      </TabsContent>
    </Tabs>
  );
}
