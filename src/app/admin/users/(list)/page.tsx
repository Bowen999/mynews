import type { Metadata } from "next";
import { AdminNav } from "@/components/AdminNav";
import { UserTable, type UserTableRow } from "@/components/AdminUsers";
import { PAGE_HEADS, PageHead } from "@/components/PageHead";
import { Page } from "@/components/PageTransition";
import { loadAdminData, userRows } from "@/lib/admin";
import { providerLabel } from "@/lib/auth/providers";
import { requireAdminPage } from "@/lib/session";
import { formatAgo, formatDate } from "@/lib/util/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Users" };

/** Every account with its usage. Admins only; everyone else gets a 404. */
export default async function AdminUsersPage() {
  await requireAdminPage("/admin/users");
  const { snapshot, accounts, problems, now } = await loadAdminData();
  // Text is formatted here so the server and the browser show the same thing.
  const rows: UserTableRow[] | null =
    snapshot && accounts
      ? userRows(snapshot, accounts, now).map((u) => ({
          id: u.id,
          email: u.email,
          isAdmin: u.isAdmin,
          unconfirmed: !u.confirmed,
          methods: u.providers.map(providerLabel).join(" · "),
          joined: formatDate(u.createdAt),
          joinedAt: Date.parse(u.createdAt) || 0,
          active: u.lastActiveAt ? formatAgo(u.lastActiveAt, now) : "Never",
          activeAt: u.lastActiveAt ? Date.parse(u.lastActiveAt) : 0,
          editions: u.editions,
          runsWeek: u.runsWeek,
          runs: u.runs,
          opens: u.opens,
        }))
      : null;

  return (
    <Page>
      <PageHead {...PAGE_HEADS.admin} />
      <AdminNav />
      {problems.length > 0 && (
        <div className="notices">
          {problems.map((p) => (
            <div className="notice error" key={p} role="alert">
              <strong>{p}</strong>
            </div>
          ))}
        </div>
      )}
      {rows && <UserTable rows={rows} />}
    </Page>
  );
}
