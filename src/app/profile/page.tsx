import type { Metadata } from "next";
import { ProfileEditor } from "@/components/ProfileEditor";
import { configurationProblems } from "@/lib/config";
import { systemStatus } from "@/lib/status";
import { loadProfile } from "@/lib/store";
import { defaultPreferences, type Profile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const status = systemStatus();
  const storageMissing = configurationProblems().some((p) => p.key === "SUPABASE");
  const profile: Profile = storageMissing
    ? { id: "default", name: "My briefing", sources: [], interest: null, preferences: defaultPreferences(), createdAt: "", updatedAt: "" }
    : await loadProfile();
  return (
    <div className="container narrow">
      <header className="page-head" style={{ paddingBottom: 28 }}>
        <div className="kicker">Personalization</div>
        <h1>Profile &amp; sources</h1>
        <p>Who the briefing is for, what to emphasize, and how the system is configured.</p>
      </header>
      <ProfileEditor initial={profile} status={status} />
    </div>
  );
}
