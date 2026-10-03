import type { Metadata } from "next";
import { AuthPage } from "@/components/AuthPage";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPage() {
  return <AuthPage mode="forgot" statement="Forgot your password?" dek="We’ll email you a reset link." />;
}
