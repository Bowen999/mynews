/** Building blocks shared by the admin pages. */

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="form-section">
      <header>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </header>
      <div className="fields">{children}</div>
    </section>
  );
}

/** A row of large numbers with a label and one line of context under each. */
export function Figures({ children, cols = 3 }: { children: React.ReactNode; cols?: 3 | 4 }) {
  return (
    <div className="figures" data-cols={cols}>
      {children}
    </div>
  );
}

export function Figure({ label, value, unit, note }: { label: string; value: React.ReactNode; unit?: string; note?: React.ReactNode }) {
  return (
    <div className="figure">
      <div className="label muted">{label}</div>
      <div className="num">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function Tag({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <span className={`tag${muted ? " muted" : ""}`}>{children}</span>;
}
