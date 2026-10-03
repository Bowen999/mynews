/** Fixed page headings, shared by each page and its loading skeleton so the heading never shifts. */
export const PAGE_HEADS = {
  archive: { label: "Every edition, newest first", title: "Archive" },
  profile: { label: "Personalization", title: "Profile & settings" },
  admin: { label: "Admins only", title: "Admin" },
} as const;

export function PageHead({ label, title, dek }: { label: React.ReactNode; title: React.ReactNode; dek?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div className="label">{label}</div>
      <h1 className="title-xl">{title}</h1>
      {dek && <p className="dek">{dek}</p>}
    </header>
  );
}
