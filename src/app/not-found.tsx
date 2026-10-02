import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap">
      <section className="hero">
        <div className="label">404</div>
        <h1 className="display" style={{ marginTop: 24 }}>
          Not in any edition.
        </h1>
        <p className="dek">The page may have been removed, belongs to another account, or the link is incomplete.</p>
        <div className="actions">
          <Link className="btn btn-solid" href="/">
            Back to today <span className="arrow">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
