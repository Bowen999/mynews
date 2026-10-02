import type { Metadata } from "next";
import { profileForUser } from "@/lib/accounts";
import { ProfileEditor } from "@/components/ProfileEditor";
import { hasSupabaseAuth } from "@/lib/config";
import { checkQuota } from "@/lib/quota";
import { requirePageUser } from "@/lib/session";
import { systemStatus } from "@/lib/status";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requirePageUser("/profile");
  const store = getStore();
  const profile = await profileForUser(user, store);
  const quota = await checkQuota(user, profile, store);
  return (
    <div className="wrap">
      <header className="page-head">
        <div className="label">Personalization</div>
        <h1 className="title-xl">Profile &amp; settings</h1>
        <p className="dek">Who your briefing is about, what to emphasize, and how you are notified.</p>
      </header>
      <ProfileEditor
        initial={profile}
        status={user.isAdmin ? systemStatus() : null}
        usage={{ used: quota.used, limit: quota.limit, nextSlotAt: quota.nextSlotAt }}
        account={{ email: user.email, isAdmin: user.isAdmin, authKind: hasSupabaseAuth() ? "supabase" : "local" }}
      />
    </div>
  );
}
