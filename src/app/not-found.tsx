import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container hero">
      <div className="kicker" style={{ justifyContent: "center" }}>
        404
      </div>
      <h1>This page isn&apos;t in any edition.</h1>
      <p>It may have been removed, or the link is incomplete.</p>
      <div className="actions">
        <Link className="btn btn-primary" href="/">
          Back to today
        </Link>
      </div>
    </div>
  );
}
