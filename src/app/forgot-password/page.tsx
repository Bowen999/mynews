import type { Metadata } from "next";
import { AuthPage } from "@/components/AuthPage";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPage() {
  return <AuthPage mode="forgot" statement="Forgot your password?" dek="Enter the email you signed up with and we will send you a link to choose a new one." />;
}
