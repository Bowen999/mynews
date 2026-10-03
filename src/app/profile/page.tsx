import type { Metadata } from "next";
import { profileForUser } from "@/lib/accounts";
import { PAGE_HEADS, PageHead } from "@/components/PageHead";
import { Page } from "@/components/PageTransition";
import { ProfileEditor } from "@/components/ProfileEditor";
import { hasSupabaseAuth } from "@/lib/config";
import { checkQuota } from "@/lib/quota";
import { requirePageUser } from "@/lib/session";
import { readingSummary } from "@/lib/pipeline/semantic";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requirePageUser("/profile");
  const store = getStore();
  const profile = await profileForUser(user, store);
  const quota = await checkQuota(user, profile, store);
  const reading = await readingSummary(store, profile.id);

  return (
    <Page>
      <PageHead {...PAGE_HEADS.profile} />
      <ProfileEditor
        initial={profile}
        usage={{ used: quota.used, limit: quota.limit, nextSlotAt: quota.nextSlotAt }}
        account={{ email: user.email, isAdmin: user.isAdmin, authKind: hasSupabaseAuth() ? "supabase" : "local", providers: user.providers ?? ["email"] }}
        reading={reading}
      />
    </Page>
  );
}
