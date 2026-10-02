import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/AuthPage";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await currentUser()) redirect("/");
  return (
    <AuthPage
      mode="signup"
      statement="Your week, distilled."
      dek="Create an account, add the pages that describe your work, and get ten verified stories from the past seven days, every statement linked to its source."
    />
  );
}
