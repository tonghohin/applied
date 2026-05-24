import { ProfileContent } from "@/components/profile/profile-content";

export default function ProfilePage() {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>
      <ProfileContent />
    </div>
  );
}
