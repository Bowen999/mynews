import { notFound } from "next/navigation";
import { currentUser } from "@/lib/session";

/**
 * Settled before any page's loading skeleton streams, so a signed-in non-admin gets a real 404 and
 * never sees the admin headings. Signed-out visitors are sent to sign-in by the proxy, and every
 * page checks again with requireAdminPage.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (user && !user.isAdmin) notFound();
  return children;
}
