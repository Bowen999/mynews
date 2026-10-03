/** Fixed page headings, shared by each page and its loading skeleton so the heading never shifts. */
export const PAGE_HEADS = {
  archive: {
    label: "Every edition, preserved",
    title: "Archive",
    dek: "Each briefing is an independent edition. Open any past week, or download it as a standalone page.",
  },
  profile: {
    label: "Personalization",
    title: "Profile & settings",
    dek: "Who your briefing is about, what to emphasize, and how you are notified.",
  },
  admin: {
    label: "Admins only",
    title: "Admin",
    dek: "What this deployment can see and use, and how much the app is being used.",
  },
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
