import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/AuthPage";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return <AuthPage mode="login" statement="Welcome back." dek="Your weekly briefing is waiting: the ten things that mattered to your work in the past seven days." />;
}
