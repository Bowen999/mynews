import Link from "next/link";
import { Page } from "@/components/PageTransition";

export default function NotFound() {
  return (
    <Page>
      <section className="hero">
        <div className="label">404</div>
        <h1 className="display" style={{ marginTop: 24 }}>
          Not in any edition.
        </h1>
        <p className="dek">It may have been removed, or the link is wrong.</p>
        <div className="actions">
          <Link className="btn btn-solid" href="/">
            Back to the front page <span className="arrow">→</span>
          </Link>
        </div>
      </section>
    </Page>
  );
}
