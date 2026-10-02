import type { Metadata } from "next";
import { AuthPage } from "@/components/AuthPage";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New password" };

export default async function NewPasswordPage() {
  await requirePageUser("/account/password");
  return <AuthPage mode="reset" statement="Almost there." dek="Choose a new password for your account." />;
}
