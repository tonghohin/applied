import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { users } from "../schema/auth";
import { profiles } from "../schema/profiles";

export async function getProfileForUser(db: Db, userId: string) {
  return db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .then((r) => r[0]);
}

export async function getProfileWithEmailForUser(db: Db, userId: string) {
  return db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      phone: profiles.phone,
      address: profiles.address,
      linkedinUrl: profiles.linkedinUrl,
      githubUrl: profiles.githubUrl,
      websiteUrl: profiles.websiteUrl,
      resume: profiles.resume,
      coverLetterInstructions: profiles.coverLetterInstructions,
      requiresSponsorship: profiles.requiresSponsorship,
      noticePeriod: profiles.noticePeriod,
      createdAt: profiles.createdAt,
      updatedAt: profiles.updatedAt,
      email: users.email,
    })
    .from(profiles)
    .innerJoin(users, eq(profiles.userId, users.id))
    .where(eq(profiles.userId, userId))
    .then((r) => r[0]);
}
