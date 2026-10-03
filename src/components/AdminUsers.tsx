"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Tag } from "./AdminParts";

/** A user as the table shows it: text is formatted on the server, numbers are for sorting. */
export interface UserTableRow {
  id: string;
  email: string;
  isAdmin: boolean;
  unconfirmed: boolean;
  methods: string;
  joined: string;
  joinedAt: number;
  active: string;
  activeAt: number;
  editions: number;
  runsWeek: number;
  runs: number;
  opens: number;
}

const SORTS = {
  active: { label: "Last active", cmp: (a: UserTableRow, b: UserTableRow) => b.activeAt - a.activeAt },
  joined: { label: "Newest", cmp: (a: UserTableRow, b: UserTableRow) => b.joinedAt - a.joinedAt },
  email: { label: "Email", cmp: (a: UserTableRow, b: UserTableRow) => a.email.localeCompare(b.email) },
  editions: { label: "Most editions", cmp: (a: UserTableRow, b: UserTableRow) => b.editions - a.editions },
  runs: { label: "Most runs this week", cmp: (a: UserTableRow, b: UserTableRow) => b.runsWeek - a.runsWeek || b.runs - a.runs },
  opens: { label: "Most stories opened", cmp: (a: UserTableRow, b: UserTableRow) => b.opens - a.opens },
} as const;

type SortKey = keyof typeof SORTS;

/** Every account, searchable by email and sortable. Each email opens that user's page. */
export function UserTable({ rows }: { rows: UserTableRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("active");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => !q || r.email.toLowerCase().includes(q)).sort((a, b) => SORTS[sort].cmp(a, b) || a.email.localeCompare(b.email));
  }, [rows, query, sort]);

  return (
    <>
      <div className="utable-tools">
        <label className="visually-hidden" htmlFor="user-search">
          Search users by email
        </label>
        <input id="user-search" className="input" type="search" placeholder="Search email" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="visually-hidden" htmlFor="user-sort">
          Sort users
        </label>
        <select id="user-sort" className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {(Object.keys(SORTS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORTS[k].label}
            </option>
          ))}
        </select>
        <span className="meta" aria-live="polite">
          {shown.length === rows.length ? `${rows.length} ${rows.length === 1 ? "user" : "users"}` : `${shown.length} of ${rows.length} users`}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="body muted" style={{ marginTop: 28 }}>
          {rows.length === 0 ? "No users yet." : "No one matches."}
        </p>
      ) : (
        <table className="utable">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Joined</th>
              <th scope="col">Last active</th>
              <th scope="col" className="num">
                Editions
              </th>
              <th scope="col" className="num">
                Runs <small>7 d / all</small>
              </th>
              <th scope="col" className="num">
                Opened <small>30 d</small>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="u-user">
                  <Link className="u-email" href={`/admin/users/${encodeURIComponent(r.id)}`}>
                    {r.email}
                  </Link>
                  {r.isAdmin && <Tag>Admin</Tag>}
                  {r.unconfirmed && <Tag muted>Unconfirmed</Tag>}
                  <div className="meta">{r.methods}</div>
                </td>
                <td data-label="Joined">{r.joined}</td>
                <td data-label="Last active">{r.active}</td>
                <td data-label="Editions" className="num">
                  {r.editions}
                </td>
                <td data-label="Runs (7 d / all)" className="num">
                  {r.runsWeek} <span className="muted">/ {r.runs}</span>
                </td>
                <td data-label="Opened (30 d)" className="num">
                  {r.opens}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
