import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/AuthPage";
import { enabledOAuthProviders } from "@/lib/auth/oauth";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  const [user, providers] = await Promise.all([currentUser(), enabledOAuthProviders()]);
  if (user) redirect("/");
  return (
    <AuthPage
      mode="signup"
      statement="Your week, distilled."
      dek="Ten verified stories a week, picked for your work."
      providers={providers}
    />
  );
}
