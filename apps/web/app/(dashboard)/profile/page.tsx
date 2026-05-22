"use client";

import { CriteriaForm } from "@/components/profile/criteria-form";
import { ProfileForm } from "@/components/profile/profile-form";
import { ProfileSkeleton } from "@/components/profile/profile-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";

export default function ProfilePage() {
  const { data, isLoading } = trpc.profile.getProfile.useQuery();

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  const profile = data?.profile;
  const criteria = data?.criteria;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>
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
    </div>
  );
}
